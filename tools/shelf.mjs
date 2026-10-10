// The shelf's pictures (components/Shelf.astro): each chapter's statue, cut from its scene's phone still (already
// centred on the scene's subject by tools/scenes/posters.mjs), 600 x 760, in public/shelf/<chapter>.webp.
// Run after the posters:   node tools/shelf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'public/shelf');
// where the subject sits down the phone still (its top, as a fraction of the height)
const top = { hero: 0.08, solutions: 0.2, gifts: 0.12, packaging: 0.16, uniform: 0.12, production: 0.22, giveaways: 0.14, pos: 0.3, identity: 0.24, communication: 0.1, visualization: 0.12, outdoor: 0.18, events: 0.16, photography: 0.18 };
const ids = Object.keys(top).filter((id) => id !== 'hero');
fs.mkdirSync(OUT, { recursive: true });
for (const id of ids) {
  const src = path.join(ROOT, 'public/scenes', id, 'poster-m.avif');
  if (!fs.existsSync(src)) {
    console.warn(`${id}: no still yet`);
    continue;
  }
  const img = sharp(src);
  const { width, height } = await img.metadata();
  const h = Math.round(width / 0.789);
  const y = Math.max(0, Math.min(height - h, Math.round(height * top[id])));
  await img.extract({ left: 0, top: y, width, height: h }).resize(600, 760).webp({ quality: 76 }).toFile(path.join(OUT, `${id}.webp`));
  console.log(`${id}: ${(fs.statSync(path.join(OUT, `${id}.webp`)).size / 1024).toFixed(0)} KB`);
}
