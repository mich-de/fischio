// Scraping da ESPN: dati reali senza chiave API.
// Usa gli endpoint pubblici di ESPN (site.api.espn.com).

const SCORE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const STAND_BASE = 'https://site.web.api.espn.com/apis/v2/sports/soccer';
const TZ = process.env.TIMEZONE || 'Europe/Rome';

// Campionati: slug ESPN → info per l'app. L'ordine conta.
const LEAGUES = [
  { slug: 'ita.1',           name: 'Serie A',          country: 'Italy' },
  { slug: 'uefa.champions',  name: 'Champions League', country: 'World' },
  { slug: 'uefa.europa',     name: 'Europa League',    country: 'World' },
  { slug: 'eng.1',           name: 'Premier League',   country: 'England' },
  { slug: 'esp.1',           name: 'LaLiga',           country: 'Spain' },
  { slug: 'ger.1',           name: 'Bundesliga',       country: 'Germany' },
  { slug: 'fra.1',           name: 'Ligue 1',          country: 'France' },
  { slug: 'ita.2',           name: 'Serie B',          country: 'Italy' },
];
// Mappa id ESPN → slug per la classifica
const ID_TO_SLUG = {};

async function espn(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

// --- Status ---
function mapStatus(st) {
  const detail = st?.type?.detail || '';
  const state = st?.type?.state || '';
  const name = st?.type?.name || '';
  if (state === 'pre') return { status: 'ns', short: 'NS' };
  if (state === 'post' || name.includes('FULL_TIME') || name.includes('FINAL')) {
    if (name.includes('PENALTIES') || detail.includes('Pens')) return { status: 'ft', short: 'PEN' };
    if (name.includes('EXTRA_TIME') || detail.includes('AET')) return { status: 'ft', short: 'AET' };
    return { status: 'ft', short: 'FT' };
  }
  if (name.includes('HALFTIME') || detail === 'HT') return { status: 'ht', short: 'HT' };
  if (state === 'in') return { status: 'live', short: st?.period === 1 ? '1H' : '2H' };
  if (name.includes('POSTPONED')) return { status: 'other', short: 'PST' };
  if (name.includes('CANCEL')) return { status: 'other', short: 'CANC' };
  if (name.includes('SUSPEND')) return { status: 'other', short: 'SUSP' };
  return { status: 'other', short: detail.slice(0, 4).toUpperCase() || 'N/D' };
}

function elapsed(st) {
  const dc = st?.displayClock;
  if (!dc) return null;
  const m = dc.match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function timeStr(isoDate) {
  return new Date(isoDate).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

function teamObj(comp) {
  const t = comp?.team || {};
  return {
    id: t.id ? Number(t.id) : 0,
    name: t.displayName || t.name || t.shortDisplayName || '?',
    logo: t.logo || (t.logos && t.logos[0]?.href) || null,
  };
}

// --- Fixtures per campionato ---
function parseEvent(ev, leagueInfo) {
  const c = ev.competitions?.[0] || {};
  const st = c.status || ev.status || {};
  const mapped = mapStatus(st);
  const home = (c.competitors || []).find(x => x.homeAway === 'home') || {};
  const away = (c.competitors || []).find(x => x.homeAway === 'away') || {};
  return {
    id: Number(ev.id),
    kickoff: ev.date || c.date,
    time: timeStr(ev.date || c.date),
    ...mapped,
    elapsed: mapped.status === 'live' ? elapsed(st) : mapped.status === 'ht' ? 45 : null,
    extra: null,
    venue: c.venue?.fullName || c.venue?.address?.summary || null,
    league: {
      id: leagueInfo.slug,
      name: leagueInfo.name,
      country: leagueInfo.country,
      flag: null,
      logo: null,
      round: c.series?.summary || null,
    },
    home: teamObj(home),
    away: teamObj(away),
    hs: home.score != null ? Number(home.score) : null,
    as: away.score != null ? Number(away.score) : null,
  };
}

async function fetchFixtures(date) {
  // date: YYYY-MM-DD → YYYYMMDD per ESPN
  const espnDate = date.replace(/-/g, '');
  // Fetch tutti i campionati in parallelo
  const results = await Promise.allSettled(
    LEAGUES.map(async lg => {
      const data = await espn(`${SCORE_BASE}/${lg.slug}/scoreboard?dates=${espnDate}`);
      // Salva l'id ESPN per la classifica
      const lid = data.leagues?.[0]?.id;
      if (lid) ID_TO_SLUG[lid] = lg.slug;
      return (data.events || []).map(ev => parseEvent(ev, lg));
    })
  );
  // Unisci tutto mantenendo l'ordine dei campionati
  const fixtures = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fixtures.push(...r.value);
  }
  return fixtures;
}

// --- Match detail ---
function parseDetail(d) {
  if (!d) return null;
  const type = d.type?.text || '';
  const lower = type.toLowerCase();
  if (d.ownGoal) return 'own';
  if (d.penaltyKick && d.scoringPlay) return 'pen';
  if (d.penaltyKick && !d.scoringPlay) return 'misspen';
  if (d.scoringPlay || lower.includes('goal')) return 'goal';
  if (d.redCard) return 'red';
  if (d.yellowCard) return 'yellow';
  if (lower.includes('substitution') || lower.includes('sub')) return 'sub';
  return 'other';
}

function parseMinute(clock) {
  if (!clock) return { min: 0, extra: null };
  const dv = clock.displayValue || '';
  const m = dv.match(/^(\d+)'(?:\+(\d+)')?/);
  if (m) return { min: parseInt(m[1]), extra: m[2] ? parseInt(m[2]) : null };
  return { min: Math.floor((clock.value || 0) / 60), extra: null };
}

async function fetchMatchDetail(eventId) {
  // Dobbiamo sapere in quale campionato cercare. Proviamo tutti in parallelo.
  // In alternativa, il scoreboard ci dà già i details.
  // Usiamo il summary endpoint che include tutto.
  let summaryData = null;
  // Prova ogni campionato finché non troviamo il match
  for (const lg of LEAGUES) {
    try {
      const data = await espn(`${SCORE_BASE}/${lg.slug}/summary?event=${eventId}`);
      if (data.header) { summaryData = data; summaryData._lg = lg; break; }
    } catch (e) { /* prova il prossimo */ }
  }

  // Se il summary non funziona, cerca nei dati del scoreboard
  if (!summaryData) {
    // Fallback: prendi dal scoreboard di oggi
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()).replace(/-/g, '');
    for (const lg of LEAGUES) {
      try {
        const data = await espn(`${SCORE_BASE}/${lg.slug}/scoreboard?dates=${today}`);
        const ev = (data.events || []).find(e => String(e.id) === String(eventId));
        if (ev) {
          const base = parseEvent(ev, lg);
          // Estrai eventi dal details
          const c = ev.competitions?.[0] || {};
          const events = (c.details || [])
            .map(d => {
              const kind = parseDetail(d);
              if (kind === 'other') return null;
              const { min, extra } = parseMinute(d.clock);
              const player = d.athletesInvolved?.[0]?.displayName || '';
              return { min, extra, side: d.team?.id == base.home.id ? 'h' : 'a', kind, player, assist: '', detail: '' };
            })
            .filter(Boolean);
          return { ...base, events, stats: [] };
        }
      } catch (e) { /* prova il prossimo */ }
    }
    throw new Error('Partita non trovata.');
  }

  // Parse dal summary
  const hdr = summaryData.header;
  const comp = hdr?.competitions?.[0] || {};
  const lg = summaryData._lg;
  const st = comp.status || {};
  const mapped = mapStatus(st);
  const homeComp = (comp.competitors || []).find(c => c.homeAway === 'home') || {};
  const awayComp = (comp.competitors || []).find(c => c.homeAway === 'away') || {};

  const base = {
    id: eventId,
    kickoff: comp.date,
    time: timeStr(comp.date),
    ...mapped,
    elapsed: mapped.status === 'live' ? elapsed(st) : null,
    extra: null,
    venue: summaryData.gameInfo?.venue?.fullName || null,
    league: { id: lg.slug, name: lg.name, country: lg.country, flag: null, logo: null, round: null },
    home: { id: Number(homeComp.team?.id || 0), name: homeComp.team?.displayName || '?', logo: homeComp.team?.logo || homeComp.team?.logos?.[0]?.href || null },
    away: { id: Number(awayComp.team?.id || 0), name: awayComp.team?.displayName || '?', logo: awayComp.team?.logo || awayComp.team?.logos?.[0]?.href || null },
    hs: homeComp.score != null ? Number(homeComp.score) : null,
    as: awayComp.score != null ? Number(awayComp.score) : null,
  };

  // Key events dal summary (commentaryItems o keyEvents)
  let events = [];
  const keyEv = summaryData.keyEvents || [];
  if (keyEv.length) {
    for (const ke of keyEv) {
      const c2 = ke.competitions?.[0] || {};
      for (const d of (c2.details || [])) {
        const kind = parseDetail(d);
        if (kind === 'other') continue;
        const { min, extra } = parseMinute(d.clock);
        const player = d.athletesInvolved?.[0]?.displayName || '';
        events.push({ min, extra, side: String(d.team?.id) === String(base.home.id) ? 'h' : 'a', kind, player, assist: '', detail: '' });
      }
    }
  }
  // Fallback: dal scoreboard details che a volte è nel header
  if (!events.length) {
    const details = comp.details || [];
    events = details
      .map(d => {
        const kind = parseDetail(d);
        if (kind === 'other') return null;
        const { min, extra } = parseMinute(d.clock);
        const player = d.athletesInvolved?.[0]?.displayName || '';
        return { min, extra, side: String(d.team?.id) === String(base.home.id) ? 'h' : 'a', kind, player, assist: '', detail: '' };
      })
      .filter(Boolean);
  }

  // Statistiche dal boxscore
  const STAT_MAP = {
    possessionPct: 'Possesso palla %', shotsTotal: 'Tiri', shotsOnTarget: 'Tiri in porta',
    cornerKicks: "Calci d'angolo", offsides: 'Fuorigioco', foulsCommitted: 'Falli',
    yellowCards: 'Ammonizioni', redCards: 'Espulsioni', saves: 'Parate',
    totalPasses: 'Passaggi', wonCorners: "Calci d'angolo",
  };
  let stats = [];
  const box = summaryData.boxscore;
  if (box?.teams) {
    const homeStats = {};
    const awayStats = {};
    for (const t of box.teams) {
      const target = t.homeAway === 'home' ? homeStats : awayStats;
      for (const s of (t.statistics || [])) {
        target[s.name] = parseFloat(s.displayValue) || 0;
      }
    }
    for (const [key, label] of Object.entries(STAT_MAP)) {
      if (homeStats[key] != null || awayStats[key] != null) {
        stats.push({ label, h: homeStats[key] || 0, a: awayStats[key] || 0 });
      }
    }
  }

  return { ...base, events, stats };
}

// --- Standings ---
async function fetchStandings(leagueSlug) {
  // leagueSlug può essere un slug (ita.1) o un id numerico
  let slug = leagueSlug;
  // Se è numerico, cerca lo slug
  if (/^\d+$/.test(String(slug))) {
    slug = ID_TO_SLUG[slug] || LEAGUES.find(l => l.slug.includes(slug))?.slug;
    if (!slug) {
      // Prova a cercarlo dalla lista
      slug = LEAGUES[0].slug;
    }
  }
  const lg = LEAGUES.find(l => l.slug === slug) || { slug, name: slug, country: '' };
  const data = await espn(`${STAND_BASE}/${slug}/standings`);
  const children = data.children || [];
  if (!children.length) throw new Error('Classifica non disponibile.');

  const groups = children.map(group => {
    const entries = group.standings?.entries || [];
    return entries.map(e => {
      const stats = {};
      for (const s of (e.stats || [])) stats[s.name] = s;
      const desc = e.note?.description || null;
      return {
        rank: stats.rank?.value || 0,
        name: e.team?.displayName || '?',
        logo: e.team?.logos?.[0]?.href || null,
        played: stats.gamesPlayed?.value || 0,
        gd: stats.pointDifferential?.value || 0,
        pts: stats.points?.value || 0,
        form: '',
        desc,
        group: children.length > 1 ? (group.name || group.abbreviation || null) : null,
      };
    }).sort((a, b) => a.rank - b.rank);
  });

  return {
    league: { id: slug, name: lg.name, country: lg.country, season: data.seasons?.[0]?.year || '' },
    groups,
  };
}

module.exports = { fetchFixtures, fetchMatchDetail, fetchStandings, LEAGUES };
