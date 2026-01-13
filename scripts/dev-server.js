#!/usr/bin/env node
/**
 * Local development server that mimics GitHub Pages structure
 *
 * This server serves the repository as if it were deployed to GitHub Pages,
 * allowing you to test the exact structure that will be deployed.
 *
 * Usage:
 *   npm run dev:serve
 *   npm run preview (builds first, then serves)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const BASE_PATH = '/structural_tools';

// MIME types
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.py': 'text/plain',
  '.md': 'text/markdown',
  '.wasm': 'application/wasm'
};

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const contentType = getContentType(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // Remove query string
  let urlPath = req.url.split('?')[0];

  // Remove base path if present
  if (urlPath.startsWith(BASE_PATH)) {
    urlPath = urlPath.substring(BASE_PATH.length);
  }

  // Default to index.html for directories
  if (urlPath === '/' || urlPath === '') {
    urlPath = '/index.html';
  }

  // Special handling for 2dfea: serve from dist/ folder
  if (urlPath.startsWith('/2dfea/') || urlPath === '/2dfea') {
    // Remove /2dfea prefix and add /2dfea/dist prefix
    const subPath = urlPath.substring('/2dfea'.length);
    urlPath = '/2dfea/dist' + (subPath || '/index.html');
  }

  // Construct file path
  let filePath = path.join(__dirname, '..', urlPath);

  // Check if path is a directory and serve index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  console.log(`${req.method} ${req.url} -> ${filePath}`);

  // Serve the file
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Local Development Server (GitHub Pages structure)        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🌐 Server running at:`);
  console.log(`   http://localhost:${PORT}${BASE_PATH}/`);
  console.log('');
  console.log('📱 Module URLs:');
  console.log(`   2D FEM:  http://localhost:${PORT}${BASE_PATH}/2dfea/`);
  console.log(`   Pryout:  http://localhost:${PORT}${BASE_PATH}/pryout/`);
  console.log(`   More:    http://localhost:${PORT}${BASE_PATH}/`);
  console.log('');
  console.log('💡 Tips:');
  console.log('   - Server mimics GitHub Pages structure');
  console.log('   - Changes to plain HTML modules are live');
  console.log('   - For 2dfea changes, run: npm run build:2dfea');
  console.log('   - Press Ctrl+C to stop');
  console.log('');

  // Try to open browser
  const url = `http://localhost:${PORT}${BASE_PATH}/`;
  const start = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${start} ${url}`);
});
