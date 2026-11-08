// GET /api/standings?league=ita.1  → classifica
const { fetchStandings } = require('./_scrape.js');
const { send, query, handler, HttpError } = require('./_lib.js');

module.exports = handler(async (req, res) => {
  const league = String(query(req).league || '').trim();
  if (!league) throw new HttpError(400, 'Manca il campionato.');

  const data = await fetchStandings(league);
  send(res, 200, { demo: false, ...data }, 3600);
});
