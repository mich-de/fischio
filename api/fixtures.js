// GET /api/fixtures?date=YYYY-MM-DD  → partite del giorno, raggruppabili per campionato
const L = require('./_lib.js');

module.exports = L.handler(async (req, res) => {
  const today = L.todayISO();
  const { date = today } = L.query(req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new L.HttpError(400, 'Data non valida, usa il formato AAAA-MM-GG.');

  if (L.isDemo()) {
    const offset = Math.round((Date.parse(date) - Date.parse(today)) / 864e5);
    return L.send(res, 200, { date, demo: true, fixtures: L.demo.fixtures(Math.max(-3, Math.min(3, offset))) });
  }

  const raw = await L.api('/fixtures', { date, timezone: L.TZ });
  let list = raw.map(L.fixture);
  if (L.LEAGUES) {
    list = list.filter(f => L.LEAGUES.includes(f.league.id));
    list.sort((a, b) => L.LEAGUES.indexOf(a.league.id) - L.LEAGUES.indexOf(b.league.id) || a.kickoff.localeCompare(b.kickoff));
  } else {
    list.sort((a, b) => a.league.country.localeCompare(b.league.country) || a.league.id - b.league.id || a.kickoff.localeCompare(b.kickoff));
  }
  const maxAge = date === today ? L.LIVE_CACHE : date < today ? 21600 : 1800;
  L.send(res, 200, { date, demo: false, fixtures: list }, maxAge);
});
