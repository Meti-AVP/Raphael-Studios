// Study helper: write every texture of the reference scenes' .glb files as PNG, plus a JSON summary.
//   node tools/scenes/extract.mjs <reference models folder> <out folder>
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { PNG } from 'pngjs';
import { decodeKTX2 } from './ktx.mjs';

const [srcDir, outDir] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : f.endsWith('.glb') && files.push(p); } })(srcDir);
fs.mkdirSync(outDir, { recursive: true });
for (const file of files) {
  const name = path.basename(file, '.glb').replace(/_compressed-optimized(v2)?|-optimized/g, '');
  const doc = await io.read(file);
  const root = doc.getRoot();
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, tex] of root.listTextures().entries()) {
    const img = tex.getImage();
    if (!img) continue;
    const mime = tex.getMimeType();
    const base = `${i}_${(tex.getName() || tex.getURI() || 'tex').replace(/[^\w.-]+/g, '_')}`;
    if (mime === 'image/ktx2') {
      const { width, height, data } = await decodeKTX2(img);
      const png = new PNG({ width, height });
      png.data = Buffer.from(data);
      fs.writeFileSync(path.join(dir, base + '.png'), PNG.sync.write(png));
      console.log(name, base, `${width}x${height}`);
    } else {
      fs.writeFileSync(path.join(dir, base + '.' + mime.split('/')[1]), img);
    }
  }
}
