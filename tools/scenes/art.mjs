// v3's repainted scenes start here: each scene's textures as the build sees them (decoded, with v2's rebrand edits),
// written as PNG for the repaint (tools/scenes/remake/). A finished repaint goes to art/scenes/<scene>/<name>.png,
// where build.mjs takes it in place of the texture.
//
//   node tools/scenes/art.mjs <scene|all> [out folder]     default out: D:/RAhpel/.work-raphael/v4-art
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { scenes } from './config.mjs';
import { io, rebrand, artFile } from './build.mjs';
import { decodeKTX2 } from './ktx.mjs';

const [which = 'all', outRoot = 'D:/RAhpel/.work-raphael/v4-art'] = process.argv.slice(2);
const safe = (n) => n.replace(/[^\w.-]+/g, '_');
const write = (file, rgba) => {
  const png = new PNG({ width: rgba.width, height: rgba.height });
  png.data = Buffer.from(rgba.data);
  fs.writeFileSync(file, PNG.sync.write(png));
};

for (const s of scenes) {
  if (which !== 'all' && which !== s.id) continue;
  const dir = path.join(outRoot, s.id, 'src');
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n# ${s.id}`);
  for (const [i, a] of s.assets.entries()) {
    if (a.kind === 'glb') {
      const doc = await io.read(a.src);
      for (const [k, tex] of doc.getRoot().listTextures().entries()) {
        if (tex.getMimeType() !== 'image/ktx2') continue;
        const name = `${path.basename(a.src, '.glb')}#${k}:${tex.getName() || 'tex'}`;
        const rgba = rebrand(s.id, name, await decodeKTX2(tex.getImage()));
        write(path.join(dir, `${safe(name)}.png`), rgba);
        const used = doc
          .getRoot()
          .listMeshes()
          .filter((m) => m.listPrimitives().some((p) => [p.getMaterial()?.getBaseColorTexture(), p.getMaterial()?.getEmissiveTexture()].includes(tex)))
          .map((m) => m.getName());
        console.log(`  asset-${i + 1} ${safe(name)}.png ${rgba.width}x${rgba.height}  <- ${used.join(', ')}`);
        console.log(`      art: ${path.relative(process.cwd(), artFile(s.id, name))}`);
      }
    } else if (a.src) {
      const name = path.basename(a.src);
      const rgba = rebrand(s.id, name, await decodeKTX2(fs.readFileSync(a.src)));
      write(path.join(dir, `${safe(name)}.png`), rgba);
      console.log(`  asset-${i + 1} ${safe(name)}.png ${rgba.width}x${rgba.height}  (backdrop)`);
      console.log(`      art: ${path.relative(process.cwd(), artFile(s.id, name))}`);
    }
  }
}
