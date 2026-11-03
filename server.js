/**
 * Production server for the hosted demo: serves the built web app (dist/) and the agent API.
 *
 * Usage: npm run build && PUBLIC_MODE=1 npm start
 * Env: PORT (default 3000), HOST (default 127.0.0.1; use 0.0.0.0 on a host), plus the keys in .env.example.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './agent/config.js';
import { apiMiddleware } from './agent/api.js';

const DIST = path.join(CONFIG.root, 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Missing dist/. Run: npm run build');
  process.exit(1);
}

function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  // Resolve inside dist/ only; anything else (and every app route) gets index.html
  let file = path.join(DIST, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) return apiMiddleware(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      return res.end();
    }
    serveStatic(req, res);
  })
  .listen(PORT, HOST, () => {
    console.log(`GhostAgent on http://${HOST}:${PORT}${process.env.PUBLIC_MODE === '1' ? ' (public mode: owner routes off, rate limits on)' : ''}`);
  });
