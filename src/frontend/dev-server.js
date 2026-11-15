/* Zero-dependency static dev server:  node dev-server.js [port]  (default 5173) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.argv[2] || process.env.PORT || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

// /api/* is forwarded to the Flask backend, so the browser only ever talks to ONE origin.
// That is what lets a single HTTPS tunnel (for phone testing) cover both the app and the API.
const backend = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:5000');

function proxyToBackend(req, res) {
  const upstream = http.request(
    { hostname: backend.hostname, port: backend.port, path: req.url, method: req.method,
      headers: { ...req.headers, host: backend.host } },
    (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Backend not reachable at ${backend.origin}. Start it with: python -m flask --app app run --port ${backend.port}` }));
  });
  req.pipe(upstream);
}

const server = http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxyToBackend(req, res);
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; return res.end('Not found'); }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
    });
  });

// If the port is busy (e.g. another dev server is still running), try the next ones.
function listen(p, triesLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${p} is in use, trying ${p + 1}...`);
      listen(p + 1, triesLeft - 1);
    } else {
      throw err;
    }
  });
  server.listen(p, () => console.log(`Toward the Light frontend: http://localhost:${p}`));
}
listen(port, 10);
