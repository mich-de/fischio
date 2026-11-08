// GET /api/standings?league=135[&season=2026]  → classifica
const L = require('./_lib.js');

module.exports = L.handler(async (req, res) => {
  const q = L.query(req);
  const league = Number(q.league);
  if (!league) throw new L.HttpError(400, 'Manca il campionato.');
  const season = Number(q.season) || L.currentSeason();

  if (L.isDemo()) return L.send(res, 200, { demo: true, ...L.demo.standings(league) });

  const r = await L.api('/standings', { league, season });
  const data = L.standings(r);
  if (!data.groups.length) throw new L.HttpError(404, 'Classifica non disponibile per questa competizione.');
  L.send(res, 200, { demo: false, ...data }, 3600);
});
