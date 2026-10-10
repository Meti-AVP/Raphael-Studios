// Where each mesh paints in its textures, as masks: one PNG per mesh and texture (white where the mesh's UV
// triangles land), so the remake can recolour exactly the robe, the cup or the cheetah and nothing beside them.
//
//   node tools/scenes/remake/uvmasks.mjs <scene|all> [out folder]     default out: D:/RAhpel/.work-raphael/v4-art
// writes <out>/<scene>/uv/<texture>--<mesh>.png
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { scenes } from '../config.mjs';
import { io } from '../build.mjs';

const [which = 'all', outRoot = 'D:/RAhpel/.work-raphael/v4-art'] = process.argv.slice(2);
const safe = (n) => n.replace(/[^\w.-]+/g, '_');

/** fills the triangle (pixel coordinates) into mask (w x h, 1 byte per pixel) */
function fill(mask, w, h, ax, ay, bx, by, cx, cy) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-9) return;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // conservative: a pixel counts when any of its corners or its centre is inside (no gaps along the seams)
      for (const [px, py] of [[x + 0.5, y + 0.5], [x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) {
          mask[y * w + x] = 255;
          break;
        }
      }
    }
  }
}

for (const s of scenes) {
  if (which !== 'all' && which !== s.id) continue;
  const dir = path.join(outRoot, s.id, 'uv');
  fs.mkdirSync(dir, { recursive: true });
  console.log(`\n# ${s.id}`);
  for (const a of s.assets) {
    if (a.kind !== 'glb') continue;
    const doc = await io.read(a.src);
    const textures = doc.getRoot().listTextures();
    const masks = new Map(); // texture name + mesh -> { w, h, mask }
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        const uv = prim.getAttribute('TEXCOORD_0');
        for (const tex of [mat?.getBaseColorTexture(), mat?.getEmissiveTexture()]) {
          if (!tex || !uv || tex.getMimeType() !== 'image/ktx2') continue;
          const k = textures.indexOf(tex);
          const name = safe(`${path.basename(a.src, '.glb')}#${k}:${tex.getName() || 'tex'}`);
          const [w, h] = tex.getSize() ?? [0, 0];
          const key = `${name}--${safe(mesh.getName())}`;
          if (!masks.has(key)) masks.set(key, { w, h, mask: new Uint8Array(w * h) });
          const { mask } = masks.get(key);
          const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: uv.getCount() }, (_, i) => i);
          const uvs = uv.getArray();
          for (let i = 0; i < idx.length; i += 3) {
            const [p, q, r] = [idx[i], idx[i + 1], idx[i + 2]];
            fill(mask, w, h, uvs[p * 2] * w, uvs[p * 2 + 1] * h, uvs[q * 2] * w, uvs[q * 2 + 1] * h, uvs[r * 2] * w, uvs[r * 2 + 1] * h);
          }
        }
      }
    }
    for (const [key, { w, h, mask }] of masks) {
      const png = new PNG({ width: w, height: h, colorType: 0, inputColorType: 0, bitDepth: 8 });
      png.data = Buffer.from(mask);
      fs.writeFileSync(path.join(dir, `${key}.png`), PNG.sync.write(png, { colorType: 0, inputColorType: 0 }));
      let n = 0;
      for (const v of mask) n += v ? 1 : 0;
      console.log(`  ${key}.png  ${((100 * n) / (w * h)).toFixed(1)}%`);
    }
  }
}
