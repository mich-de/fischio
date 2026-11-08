// Funzioni comuni: chiamate ad API-Football, normalizzazione dei dati, risposte JSON con cache CDN.
const demo = require('./_demo.js');

const BASE = 'https://v3.football.api-sports.io';
const KEY = process.env.API_FOOTBALL_KEY || '';
const TZ = process.env.TIMEZONE || 'Europe/Rome';
// ID dei campionati da mostrare (ordine = ordine in app). "all" = tutti.
// 135 Serie A, 136 Serie B, 39 Premier League, 140 LaLiga, 78 Bundesliga, 61 Ligue 1, 2 Champions, 3 Europa League, 848 Conference
const LEAGUES_RAW = process.env.LEAGUES || '135,2,3,848,39,140,78,61,136';
const LEAGUES = LEAGUES_RAW === 'all' ? null : LEAGUES_RAW.split(',').map(s => Number(s.trim()));
// Secondi di cache per le partite di oggi. Col piano gratuito (100 richieste/giorno) usa 900 o più.
const LIVE_CACHE = Number(process.env.LIVE_CACHE || 120);

const isDemo = () => !KEY;

function currentSeason() {
  if (process.env.SEASON) return Number(process.env.SEASON);
  const d = new Date();
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

async function api(path, params) {
  const u = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'x-apisports-key': KEY } });
  if (!r.ok) throw new HttpError(502, `Il fornitore dei dati ha risposto con errore ${r.status}.`);
  const j = await r.json();
  const errs = j.errors ? (Array.isArray(j.errors) ? j.errors : Object.values(j.errors)) : [];
  if (errs.length) throw new HttpError(502, 'Fornitore dati: ' + errs.join('; '));
  return j.response || [];
}

const LIVE = ['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];
const DONE = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
function statusOf(s) {
  if (s === 'HT') return 'ht';
  if (LIVE.includes(s)) return 'live';
  if (DONE.includes(s)) return 'ft';
  if (s === 'NS' || s === 'TBD') return 'ns';
  return 'other'; // rinviata, annullata, sospesa...
}

function fixture(f) {
  const t = new Date(f.fixture.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return {
    id: f.fixture.id,
    kickoff: f.fixture.date,
    time: t,
    status: statusOf(f.fixture.status.short),
    short: f.fixture.status.short,
    elapsed: f.fixture.status.elapsed,
    extra: f.fixture.status.extra ?? null,
    venue: f.fixture.venue?.name || null,
    league: { id: f.league.id, name: f.league.name, country: f.league.country, flag: f.league.flag, logo: f.league.logo, round: f.league.round },
    home: { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
    away: { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
    hs: f.goals.home,
    as: f.goals.away,
  };
}

function eventKind(e) {
  const d = (e.detail || '').toLowerCase();
  if (e.type === 'Goal') return d.includes('own') ? 'own' : d.includes('missed') ? 'misspen' : d.includes('penalty') ? 'pen' : 'goal';
  if (e.type === 'Card') return d.includes('red') || d.includes('second') ? 'red' : 'yellow';
  if (e.type === 'subst') return 'sub';
  if (e.type === 'Var') return 'var';
  return 'other';
}

const STAT_LABELS = {
  'Ball Possession': 'Possesso palla %', 'expected_goals': 'Gol attesi (xG)', 'Total Shots': 'Tiri',
  'Shots on Goal': 'Tiri in porta', 'Corner Kicks': "Calci d'angolo", 'Offsides': 'Fuorigioco',
  'Fouls': 'Falli', 'Yellow Cards': 'Ammonizioni', 'Red Cards': 'Espulsioni', 'Goalkeeper Saves': 'Parate',
  'Passes %': 'Precisione passaggi %',
};
const num = v => v == null ? 0 : Number(String(v).replace('%', '')) || 0;

function matchDetail(f) {
  const base = fixture(f);
  const homeId = f.teams.home.id;
  const events = (f.events || []).map(e => ({
    min: e.time.elapsed, extra: e.time.extra, side: e.team.id === homeId ? 'h' : 'a',
    kind: eventKind(e), player: e.player?.name || '', assist: e.assist?.name || '', detail: e.detail || '',
  })).filter(e => e.kind !== 'other');
  let stats = [];
  const [sh, sa] = f.statistics || [];
  if (sh && sa) {
    const byType = (s, t) => (s.statistics.find(x => x.type === t) || {}).value;
    stats = Object.keys(STAT_LABELS)
      .filter(t => byType(sh, t) != null || byType(sa, t) != null)
      .map(t => ({ label: STAT_LABELS[t], h: num(byType(sh, t)), a: num(byType(sa, t)) }));
  }
  return { ...base, events, stats };
}

function standings(r) {
  const L = r[0]?.league;
  if (!L) return { league: null, groups: [] };
  return {
    league: { id: L.id, name: L.name, country: L.country, season: L.season },
    groups: (L.standings || []).map(g => g.map(t => ({
      rank: t.rank, name: t.team.name, logo: t.team.logo, played: t.all.played,
      gd: t.goalsDiff, pts: t.points, form: t.form, desc: t.description ? t.description.replace(/^(Promotion|Relegation)\s*-\s*/i, m => /^rel/i.test(m) ? 'Retrocessione: ' : '').replace(/\s*\(.*\)\s*$/, '') : null, group: t.group,
    }))),
  };
}

function send(res, code, body, maxAge) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', maxAge ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` : 'no-store');
  res.end(JSON.stringify(body));
}

const query = req => Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);

const handler = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { send(res, e.code || 500, { error: e.message || 'Errore del server.' }); }
};

module.exports = { api, fixture, matchDetail, standings, send, query, handler, HttpError, isDemo, demo, currentSeason, todayISO, LEAGUES, LIVE_CACHE, TZ };
