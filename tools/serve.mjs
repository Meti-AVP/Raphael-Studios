// Serve the built site (dist/) the way a production host does: Brotli/gzip compression, long cache for the
// hashed files in /assets/, the 404 page for unknown addresses. No dependencies.
//   node tools/serve.mjs [--port 4700] [--dir dist] [--host 127.0.0.1]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(arg('--dir', 'dist'));
const port = Number(arg('--port', 4700));
const host = arg('--host', '127.0.0.1');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};
const compressible = /\.(html|css|js|json|svg|txt|xml|webmanifest)$/;
const cache = new Map();

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const file = path.normalize(path.join(root, clean));
  if (!file.startsWith(root)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return path.join(file, 'index.html');
  if (!fs.existsSync(file) && !path.extname(file)) return path.join(file, 'index.html');
  return file;
}

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (err) {
    // e.g. a request that arrives while dist/ is being rebuilt: answer, never crash
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '1' });
    res.end(`Unavailable: ${err.code || err.message}`);
  }
});

function handle(req, res) {
  let file = resolve(req.url || '/');
  let status = 200;
  if (!file) {
    res.writeHead(400).end();
    return;
  }
  if (!fs.existsSync(file)) {
    file = path.join(root, '404.html');
    status = 404;
  }
  const ext = path.extname(file);
  const headers = { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  headers['Cache-Control'] = req.url?.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
  let body = fs.readFileSync(file);
  const accept = String(req.headers['accept-encoding'] || '');
  if (compressible.test(ext)) {
    const enc = accept.includes('br') ? 'br' : accept.includes('gzip') ? 'gzip' : null;
    if (enc) {
      const key = `${file}:${enc}:${fs.statSync(file).mtimeMs}`; // a rebuild changes mtime: no stale copies
      if (!cache.has(key)) cache.set(key, enc === 'br' ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : zlib.gzipSync(body, { level: 9 }));
      body = cache.get(key);
      headers['Content-Encoding'] = enc;
      headers.Vary = 'Accept-Encoding';
    }
  }
  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}
server.listen(port, host, () => console.log(`Serving ${path.relative(process.cwd(), root) || '.'} at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/  (Ctrl+C to stop)`));
