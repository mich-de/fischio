// Server locale per provare Fischio sul computer:  node server.js  →  http://localhost:3000
// Su Vercel questo file non serve: le funzioni in /api e la cartella /public vengono servite in automatico.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const m = pathname.match(/^\/api\/(fixtures|match|standings)$/);
  if (m) return require(`./api/${m[1]}.js`)(req, res);

  const file = path.join(PUB, pathname === '/' ? 'index.html' : path.normalize(pathname));
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Non trovato'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`Fischio su http://localhost:${PORT}` + (process.env.API_FOOTBALL_KEY ? '' : '  (modalità demo: imposta API_FOOTBALL_KEY per i dati reali)'));
});
