// Scraping da Sofascore: dati reali senza chiave API.
// Endpoint pubblici usati dal sito web stesso.

const BASE = 'https://api.sofascore.com/api/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
};

// Campionati da mostrare (sofascore unique_tournament_id).
// Ordine = ordine nell'app.
const TOURNAMENTS = {
  23:  { name: 'Serie A',           country: 'Italy' },
  7:   { name: 'Champions League',  country: 'World' },
  679: { name: 'Europa League',     country: 'World' },
  17:  { name: 'Premier League',    country: 'England' },
  8:   { name: 'LaLiga',            country: 'Spain' },
  35:  { name: 'Bundesliga',        country: 'Germany' },
  34:  { name: 'Ligue 1',           country: 'France' },
  325: { name: 'Serie B',           country: 'Italy' },
};
const TOURNAMENT_IDS = new Set(Object.keys(TOURNAMENTS).map(Number));

async function sofa(path) {
  const r = await fetch(BASE + path, { headers: HEADERS });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Sofascore ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

// --- Status mapping ---
// Sofascore usa: notstarted, inprogress, halftime, ended, canceled, postponed, interrupted, suspended, ...
// Il campo statusCode ha più dettaglio: not_started(0), inprogress(6,7), halftime(31), ended(100),
// canceled(70), postponed(60), suspended(80), after_penalties(110), after_extra_time(120)
function mapStatus(ev) {
  const s = (ev.status?.type || '').toLowerCase();
  const code = ev.status?.code;
  if (s === 'notstarted') return { status: 'ns', short: 'NS' };
  if (s === 'inprogress') return { status: 'live', short: code === 6 ? '1H' : '2H' };
  if (s === 'halftime')   return { status: 'ht', short: 'HT' };
  if (s === 'finished' || s === 'ended') {
    if (code === 110) return { status: 'ft', short: 'PEN' };
    if (code === 120) return { status: 'ft', short: 'AET' };
    return { status: 'ft', short: 'FT' };
  }
  if (s === 'canceled')   return { status: 'other', short: 'CANC' };
  if (s === 'postponed')  return { status: 'other', short: 'PST' };
  if (s === 'suspended')  return { status: 'other', short: 'SUSP' };
  if (s === 'interrupted') return { status: 'other', short: 'ABD' };
  return { status: 'other', short: s.toUpperCase().slice(0, 4) };
}

const TZ = process.env.TIMEZONE || 'Europe/Rome';

function time(ts) {
  return new Date(ts * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

function teamImg(t) {
  return t?.id ? `https://api.sofascore.com/api/v1/team/${t.id}/image` : null;
}
function tournImg(t) {
  return t?.uniqueTournament?.id ? `https://api.sofascore.com/api/v1/unique-tournament/${t.uniqueTournament.id}/image` : null;
}

// --- Fixtures ---
function parseFixture(ev) {
  const st = mapStatus(ev);
  return {
    id: ev.id,
    kickoff: new Date(ev.startTimestamp * 1000).toISOString(),
    time: time(ev.startTimestamp),
    ...st,
    elapsed: ev.statusTime?.played ?? ev.time?.currentPeriodStartTimestamp ? Math.floor((Date.now() / 1000 - ev.time.currentPeriodStartTimestamp) / 60) : null,
    extra: null,
    venue: ev.venue?.stadium?.name || ev.venue?.city?.name || null,
    league: {
      id: ev.tournament?.uniqueTournament?.id || ev.tournament?.id,
      name: ev.tournament?.uniqueTournament?.name || ev.tournament?.name,
      country: ev.tournament?.category?.name || '',
      flag: ev.tournament?.category?.id ? `https://api.sofascore.com/api/v1/category/${ev.tournament.category.id}/image` : null,
      logo: tournImg(ev.tournament),
      round: ev.roundInfo?.name || (ev.roundInfo?.round ? `Giornata ${ev.roundInfo.round}` : null),
    },
    home: { id: ev.homeTeam?.id, name: ev.homeTeam?.name, logo: teamImg(ev.homeTeam) },
    away: { id: ev.awayTeam?.id, name: ev.awayTeam?.name, logo: teamImg(ev.awayTeam) },
    hs: ev.homeScore?.current ?? null,
    as: ev.awayScore?.current ?? null,
  };
}

async function fetchFixtures(date) {
  const data = await sofa(`/sport/football/scheduled-events/${date}`);
  const events = data.events || [];
  // Filtra solo i campionati scelti
  let filtered = events.filter(ev => {
    const tid = ev.tournament?.uniqueTournament?.id;
    return tid && TOURNAMENT_IDS.has(tid);
  });
  // Ordina per priorità campionato, poi orario
  const order = Object.keys(TOURNAMENTS).map(Number);
  filtered.sort((a, b) => {
    const ai = order.indexOf(a.tournament?.uniqueTournament?.id);
    const bi = order.indexOf(b.tournament?.uniqueTournament?.id);
    if (ai !== bi) return ai - bi;
    return (a.startTimestamp || 0) - (b.startTimestamp || 0);
  });
  return filtered.map(parseFixture);
}

// --- Match detail ---
function mapIncidentKind(inc) {
  const t = (inc.incidentType || '').toLowerCase();
  if (t === 'goal') {
    if (inc.incidentClass === 'ownGoal') return 'own';
    if (inc.incidentClass === 'penalty') return 'pen';
    if (inc.incidentClass === 'missedPenalty') return 'misspen';
    return 'goal';
  }
  if (t === 'card') {
    if (inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed') return 'red';
    return 'yellow';
  }
  if (t === 'substitution') return 'sub';
  if (t === 'varDecision') return 'var';
  return 'other';
}

async function fetchMatchDetail(eventId) {
  // Prendi dati base, incidenti e statistiche in parallelo
  const [evData, incData, statData] = await Promise.all([
    sofa(`/event/${eventId}`).catch(() => null),
    sofa(`/event/${eventId}/incidents`).catch(() => null),
    sofa(`/event/${eventId}/statistics`).catch(() => null),
  ]);

  if (!evData?.event) throw new Error('Partita non trovata.');
  const ev = evData.event;
  const base = parseFixture(ev);

  // Incidenti → eventi
  const homeId = ev.homeTeam?.id;
  const incidents = incData?.incidents || [];
  const events = incidents
    .filter(inc => ['goal', 'card', 'substitution', 'varDecision'].includes((inc.incidentType || '').toLowerCase()))
    .map(inc => ({
      min: inc.time,
      extra: inc.addedTime || null,
      side: inc.isHome ? 'h' : 'a',
      kind: mapIncidentKind(inc),
      player: inc.player?.name || inc.playerName || '',
      assist: inc.assist1?.name || (inc.playerIn?.name || ''),
      detail: inc.reason || '',
    }))
    .filter(e => e.kind !== 'other');

  // Statistiche
  const STAT_MAP = {
    'Ball possession': 'Possesso palla %',
    'Expected goals': 'Gol attesi (xG)',
    'Total shots': 'Tiri',
    'Shots on target': 'Tiri in porta',
    'Corner kicks': "Calci d'angolo",
    'Offsides': 'Fuorigioco',
    'Fouls': 'Falli',
    'Yellow cards': 'Ammonizioni',
    'Red cards': 'Espulsioni',
    'Goalkeeper saves': 'Parate',
    'Passes completed': 'Passaggi riusciti',
    'Big chances': 'Grandi occasioni',
  };
  let stats = [];
  const periods = statData?.statistics || [];
  // Prendi "ALL" o il primo periodo disponibile
  const allPeriod = periods.find(p => p.period === 'ALL') || periods[0];
  if (allPeriod?.groups) {
    for (const group of allPeriod.groups) {
      for (const item of (group.statisticsItems || [])) {
        const label = STAT_MAP[item.name];
        if (!label) continue;
        const h = parseFloat(String(item.home || '0').replace('%', '')) || 0;
        const a = parseFloat(String(item.away || '0').replace('%', '')) || 0;
        stats.push({ label, h, a });
      }
    }
  }

  return { ...base, events, stats };
}

// --- Standings ---
async function fetchStandings(tournamentId) {
  // Prima trova la stagione corrente
  const seasonsData = await sofa(`/unique-tournament/${tournamentId}/seasons`);
  const seasons = seasonsData?.seasons || [];
  if (!seasons.length) throw new Error('Stagione non trovata.');
  const season = seasons[0]; // la prima è la più recente

  const data = await sofa(`/unique-tournament/${tournamentId}/season/${season.id}/standings/total`);
  const rows = data?.standings || [];

  return {
    league: {
      id: tournamentId,
      name: TOURNAMENTS[tournamentId]?.name || `Torneo ${tournamentId}`,
      country: TOURNAMENTS[tournamentId]?.country || '',
      season: season.year || season.name,
    },
    groups: rows.map(group => (group.rows || []).map(r => ({
      rank: r.position,
      name: r.team?.name,
      logo: teamImg(r.team),
      played: r.matches,
      gd: (r.scoresFor || 0) - (r.scoresAgainst || 0),
      pts: r.points,
      form: (r.performances || []).slice(-5).map(p => p === 'win' ? 'W' : p === 'draw' ? 'D' : p === 'loss' ? 'L' : '-').join(''),
      desc: r.promotion?.text || null,
      group: group.tournament?.name !== (TOURNAMENTS[tournamentId]?.name) ? group.tournament?.name || group.name : null,
    }))),
  };
}

module.exports = { fetchFixtures, fetchMatchDetail, fetchStandings, TOURNAMENTS };
