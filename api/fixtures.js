// GET /api/fixtures?date=YYYY-MM-DD  → partite del giorno
const { fetchFixtures } = require('./_scrape.js');
const { send, query, handler, HttpError } = require('./_lib.js');

module.exports = handler(async (req, res) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TIMEZONE || 'Europe/Rome' }).format(new Date());
  const { date = today } = query(req);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Data non valida, usa il formato AAAA-MM-GG.');

  const fixtures = await fetchFixtures(date);
  const maxAge = date === today ? 60 : date < today ? 21600 : 1800;
  send(res, 200, { date, demo: false, fixtures }, maxAge);
});
