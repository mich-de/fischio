// GET /api/match?id=123  → dettaglio partita: cronaca e statistiche
const L = require('./_lib.js');

module.exports = L.handler(async (req, res) => {
  const id = Number(L.query(req).id);
  if (!id) throw new L.HttpError(400, 'Manca l\'id della partita.');

  if (L.isDemo()) return L.send(res, 200, { demo: true, match: L.demo.match(id) });

  const r = await L.api('/fixtures', { id, timezone: L.TZ });
  if (!r[0]) throw new L.HttpError(404, 'Partita non trovata.');
  const match = L.matchDetail(r[0]);
  const maxAge = match.status === 'live' || match.status === 'ht' ? L.LIVE_CACHE : match.status === 'ft' ? 21600 : 600;
  L.send(res, 200, { demo: false, match }, maxAge);
});
