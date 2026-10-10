// The transition shaders' noise: a tileable 256 x 256 texture of 4-octave periodic gradient noise (base frequency 8),
// written once as public/scenes/shared/noise.png so the page does not compute it.
//   node tools/scenes/noise.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const SIZE = 256;
const FREQ = 8;
let s = 20111; // seeded: the same edges on every build
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const perm = new Uint8Array(512);
for (let i = 0; i < 256; i++) perm[i] = i;
for (let i = 255; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [perm[i], perm[j]] = [perm[j], perm[i]];
}
for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + t * (b - a);
const grad = (h, x, y) => G[h & 7][0] * x + G[h & 7][1] * y;
function noise(x, y, period) {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x), yf = y - Math.floor(y);
  const x0 = xi % period, y0 = yi % period, x1 = (xi + 1) % period, y1 = (yi + 1) % period;
  const u = fade(xf), v = fade(yf);
  const a = lerp(grad(perm[perm[x0] + y0], xf, yf), grad(perm[perm[x1] + y0], xf - 1, yf), u);
  const b = lerp(grad(perm[perm[x0] + y1], xf, yf - 1), grad(perm[perm[x1] + y1], xf - 1, yf - 1), u);
  return lerp(a, b, v);
}
const png = new PNG({ width: SIZE, height: SIZE });
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let sum = 0, amp = 0.5, f = 1, period = FREQ;
    for (let o = 0; o < 4; o++) {
      sum += amp * noise((x / SIZE) * FREQ * f, (y / SIZE) * FREQ * f, period);
      amp *= 0.5; f *= 2; period *= 2;
    }
    const b = Math.max(0, Math.min(255, Math.floor(((sum + 1) / 2) * 255)));
    const i = (y * SIZE + x) * 4;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = b;
    png.data[i + 3] = 255;
  }
}
const out = fileURLToPath(new URL('../../public/scenes/shared/noise.png', import.meta.url));
fs.mkdirSync(fileURLToPath(new URL('../../public/scenes/shared/', import.meta.url)), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png, { colorType: 0 }));
console.log('noise.png', fs.statSync(out).size, 'bytes');
