// GET /api/match?id=123  → dettaglio partita: cronaca e statistiche
const { fetchMatchDetail } = require('./_scrape.js');
const { send, query, handler, HttpError } = require('./_lib.js');

module.exports = handler(async (req, res) => {
  const q = query(req);
  const id = Number(q.id);
  if (!id) throw new HttpError(400, "Manca l'id della partita.");

  const match = await fetchMatchDetail(id, q.league);
  const maxAge = match.status === 'live' || match.status === 'ht' ? 60 : match.status === 'ft' ? 21600 : 600;
  send(res, 200, { demo: false, match }, maxAge);
});
