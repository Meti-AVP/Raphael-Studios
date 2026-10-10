// Study helper: each scene's painted backdrops (the 'plane' assets) as PNG.   node tools/scenes/planes.mjs <out folder>
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { scenes } from './config.mjs';
import { decodeKTX2 } from './ktx.mjs';

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
for (const s of scenes)
  for (const [i, a] of s.assets.entries()) {
    if (a.kind !== 'plane' || !a.src) continue;
    const { width, height, data } = await decodeKTX2(fs.readFileSync(a.src));
    const png = new PNG({ width, height });
    png.data = Buffer.from(data);
    const file = path.join(out, `${s.id}-asset${i + 1}.png`);
    fs.writeFileSync(file, PNG.sync.write(png));
    console.log(path.basename(file), `${width}x${height}`);
  }
