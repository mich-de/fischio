// Dati dimostrativi, usati solo quando API_FOOTBALL_KEY non è impostata.
const LG = {
  135: { id: 135, name: 'Serie A', country: 'Italy', flag: null, logo: null },
  39: { id: 39, name: 'Premier League', country: 'England', flag: null, logo: null },
  140: { id: 140, name: 'La Liga', country: 'Spain', flag: null, logo: null },
};
const T = n => ({ id: n.length * 31 + n.charCodeAt(0), name: n, logo: null });

const TODAY = [
  [1, 135, 'Inter', 'Napoli', 1, 1, 'live', '2H', 67, '18:00', [[12, 'goal', 'h', 'L. Martínez'], [28, 'yellow', 'a', 'S. Lobotka'], [41, 'goal', 'a', 'R. Lukaku'], [58, 'sub', 'a', 'D. Neres', 'M. Politano']]],
  [2, 135, 'Roma', 'Lazio', 2, 0, 'live', '1H', 23, '18:45', [[9, 'goal', 'h', 'A. Dovbyk'], [17, 'goal', 'h', 'M. Soulé'], [20, 'yellow', 'a', 'M. Guendouzi']]],
  [3, 135, 'Juventus', 'Atalanta', 2, 2, 'ft', 'FT', 90, '15:00', [[8, 'goal', 'a', 'A. Lookman'], [33, 'goal', 'h', 'D. Vlahović'], [50, 'goal', 'h', 'K. Yildiz'], [71, 'red', 'h', 'F. Gatti'], [88, 'goal', 'a', 'M. Retegui']]],
  [4, 135, 'AC Milan', 'Fiorentina', null, null, 'ns', 'NS', null, '20:45', []],
  [5, 39, 'Arsenal', 'Liverpool', 0, 0, 'ht', 'HT', 45, '17:30', [[22, 'yellow', 'h', 'D. Rice']]],
  [6, 39, 'Chelsea', 'Tottenham', 3, 1, 'ft', 'FT', 90, '15:00', [[5, 'goal', 'h', 'C. Palmer'], [30, 'goal', 'a', 'Son Heung-Min'], [61, 'goal', 'h', 'N. Jackson'], [80, 'pen', 'h', 'C. Palmer']]],
  [7, 140, 'Real Madrid', 'Sevilla', 2, 1, 'live', '2H', 78, '18:30', [[14, 'goal', 'h', 'K. Mbappé'], [47, 'goal', 'a', 'D. Lukébakio'], [69, 'goal', 'h', 'Vinícius Júnior']]],
  [8, 140, 'Barcelona', 'Atletico Madrid', null, null, 'ns', 'NS', null, '21:00', []],
];

function build(row, offset) {
  const [id, lg, h, a, hs, as, status, short, el, time, ev] = row;
  let f = { id: (offset + 3) * 100 + id, kickoff: null, time, status, short, elapsed: el, extra: null, venue: null,
    league: { ...LG[lg], round: 'Giornata dimostrativa' }, home: T(h), away: T(a), hs, as };
  if (offset < 0) f = { ...f, status: 'ft', short: 'FT', elapsed: 90, hs: (id * 3 - offset) % 4, as: (id - offset) % 3 };
  if (offset > 0) f = { ...f, status: 'ns', short: 'NS', elapsed: null, hs: null, as: null };
  f._ev = offset === 0 ? ev : [];
  return f;
}

function fixtures(offset) {
  return TODAY.map(r => { const f = build(r, offset); delete f._ev; return f; });
}

function match(id) {
  const offset = Math.floor(id / 100) - 3;
  const row = TODAY.find(r => r[0] === id % 100) || TODAY[0];
  const f = build(row, offset);
  const events = f._ev.map(([min, kind, side, player, assist]) => ({ min, extra: null, side, kind, player, assist: assist || '', detail: '' }));
  delete f._ev;
  const stats = f.status === 'ns' ? [] : [
    { label: 'Possesso palla %', h: 54, a: 46 }, { label: 'Tiri', h: 11, a: 8 }, { label: 'Tiri in porta', h: 5, a: 3 },
    { label: "Calci d'angolo", h: 6, a: 2 }, { label: 'Falli', h: 9, a: 12 },
  ];
  return { ...f, events, stats };
}

const TABLES = {
  135: ['Napoli', 'Inter', 'Roma', 'AC Milan', 'Juventus', 'Como', 'Atalanta', 'Bologna', 'Lazio', 'Fiorentina'],
  39: ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Tottenham', 'Newcastle'],
  140: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla'],
};
function standings(league) {
  const names = TABLES[league] || TABLES[135];
  return {
    league: { ...(LG[league] || LG[135]), season: 2026 },
    groups: [names.map((n, i) => ({ rank: i + 1, name: n, logo: null, played: 11, gd: 14 - i * 3, pts: 26 - i * 2, form: 'WWDLW', desc: i < 4 ? 'Champions League' : i < 6 ? 'Europa League' : null, group: null }))],
  };
}

module.exports = { fixtures, match, standings };
