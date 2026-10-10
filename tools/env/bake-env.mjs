// Bakes the studios' lighting environment (three.js's RoomEnvironment, prefiltered for rough and glossy surfaces)
// into public/studio/room-env.png, so the pages never build it themselves: building it means compiling a heavy
// filter shader in each 3D view, which stalls a phone for most of a second every time.
//
// The file is the prefiltered map exactly as three.js lays it out (its "cube UV" atlas, 336 x 256 for a 64 px
// cube), in RGBE: the top half holds each texel's red, green and blue, the bottom half its shared exponent (in red).
// A plain RGB PNG, so browsers decode it losslessly (no alpha to be premultiplied).
//
//   node tools/env/bake-env.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const THREE = path.join(ROOT, 'node_modules', 'three');
const SIZE = 64;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const page = `<!doctype html><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/three/build/three.module.js", "three/addons/": "/three/examples/jsm/" } }</script>
<script type="module">
import { WebGLRenderer, PMREMGenerator, DataUtils } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const r = new WebGLRenderer({ canvas: document.createElement('canvas') });
const rt = new PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: ${SIZE} });
const w = rt.width, h = rt.height;
const half = new Uint16Array(w * h * 4);
r.readRenderTargetPixels(rt, 0, 0, w, h, half);
// RGBE: shared exponent, 8-bit mantissas
const out = new Uint8Array(w * h * 4);
let max = 0;
for (let i = 0; i < w * h; i++) {
  const c = [0, 1, 2].map((k) => Math.max(0, DataUtils.fromHalfFloat(half[i * 4 + k])));
  const v = Math.max(...c);
  max = Math.max(max, v);
  if (v < 1e-32) continue;
  const e = Math.ceil(Math.log2(v) + 1e-9);
  const s = 256 / Math.pow(2, e);
  for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.min(255, Math.round(c[k] * s));
  out[i * 4 + 3] = e + 128;
}
window.result = { w, h, max, raw: Array.from(out) };
</script>`;

const server = http
  .createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(page);
    }
    if (!u.startsWith('/three/')) return res.writeHead(404).end();
    fs.readFile(path.join(THREE, u.slice(7)), (err, data) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(data);
    });
  })
  .listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const tab = await browser.newPage();
tab.on('pageerror', (e) => console.error(e.message));
await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await tab.waitForFunction(() => window.result, { timeout: 60000 });
const { w, h, max, raw } = await tab.evaluate(() => window.result);
await browser.close();
server.close();

// the image: mantissas on top, exponents below; rows flipped (the GPU's first row is the bottom)
const png = new PNG({ width: w, height: h * 2, colorType: 2, inputHasAlpha: false });
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const src = ((h - 1 - y) * w + x) * 4;
    const top = (y * w + x) * 4;
    const bottom = ((h + y) * w + x) * 4;
    png.data[top] = raw[src];
    png.data[top + 1] = raw[src + 1];
    png.data[top + 2] = raw[src + 2];
    png.data[top + 3] = 255;
    png.data[bottom] = raw[src + 3];
    png.data[bottom + 1] = 0;
    png.data[bottom + 2] = 0;
    png.data[bottom + 3] = 255;
  }
const file = path.join(ROOT, 'public', 'studio', 'room-env.png');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, PNG.sync.write(png, { colorType: 2, deflateLevel: 9, filterType: -1 }));
console.log(`baked ${path.relative(ROOT, file)}: ${w} x ${h} atlas (cube ${SIZE}), brightest ${max.toFixed(2)}, ${fs.statSync(file).size} bytes`);
