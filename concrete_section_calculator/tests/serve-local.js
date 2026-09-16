// Liten statisk server for nettleserverifisering av concrete_section_calculator.
// Egen port, fordi 8080 er opptatt av brukerens egen dev-server i hovedarbeidstreet.
// Serverer worktree-rota, saa modulens RELATIVE stier maa fungere paa vilkaarlig dybde —
// som er nettopp det DEPLOYMENT.md krever og det vi vil teste.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Python\\structural_tools-csc';
const PORT = 8099;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.py': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.whl': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let rel = url.replace(/^\/structural_tools/, '');
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('nope'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      console.log('404', rel);
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + rel);
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => console.log('klar paa http://localhost:' + PORT + '/'));
