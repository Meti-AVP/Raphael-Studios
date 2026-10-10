// Models replaced in place (v4): the reference's node tree and animations are kept, the geometry and the printing are
// the studio's own. Called by build.mjs (config.mjs: transform) on a model as soon as it is read.
//
//   posGiftBox: the POS chapter's terminal (its maker's product) becomes Raphael's gift box. The nodes that moved in
//   the terminal's exploded view move the same way: pos-top (its shell, lifting) is the lid, pos-bottom (its base) the
//   tray, pos-pcb (the board in the middle) the gift card lying in the tray; the screws, ports and markings go.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeKTX2 } from './ktx.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** an axis-aligned box, each face mapped to a cell of the atlas: positions, uvs, indices */
function box(min, max, cells, atlas) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const S = atlas.size;
  const pos = [];
  const uv = [];
  const idx = [];
  // each face: four corners (top left, top right, bottom left, bottom right as seen from outside) and its cell
  const faces = [
    ['top', [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]]],
    ['bottom', [[x0, y0, z1], [x1, y0, z1], [x0, y0, z0], [x1, y0, z0]]],
    ['front', [[x0, y1, z1], [x1, y1, z1], [x0, y0, z1], [x1, y0, z1]]],
    ['back', [[x1, y1, z0], [x0, y1, z0], [x1, y0, z0], [x0, y0, z0]]],
    ['right', [[x1, y1, z1], [x1, y1, z0], [x1, y0, z1], [x1, y0, z0]]],
    ['left', [[x0, y1, z0], [x0, y1, z1], [x0, y0, z0], [x0, y0, z1]]],
  ];
  for (const [name, corners] of faces) {
    const cell = atlas.cells[cells[name]];
    if (!cell) continue;
    const [cx0, cy0, cx1, cy1] = cell.map((v) => v / S);
    const base = pos.length / 3;
    corners.forEach((c) => pos.push(...c));
    uv.push(cx0, cy0, cx1, cy0, cx0, cy1, cx1, cy1);
    idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  return { pos, uv, idx };
}

async function posGiftBox(doc) {
  const root = doc.getRoot();
  const node = (n) => root.listNodes().find((x) => x.getName() === n);
  const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scenes/pos/giftbox.json'), 'utf8'));
  const png = await sharp(path.join(ROOT, 'art/scenes/pos/giftbox.png')).resize(1024, 1024).ensureAlpha().raw().toBuffer();
  const ktx = await encodeKTX2(new Uint8Array(png), { width: 1024, height: 1024, mipmaps: true, quality: 200 });
  atlas.size = 2048;
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const tex = doc.createTexture('giftbox').setImage(ktx).setMimeType('image/ktx2');
  const mat = doc.createMaterial('giftbox-painted').setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]).setEmissiveTexture(tex);
  const make = (name, b) => {
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.pos)).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(b.uv)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(b.idx)).setBuffer(buffer))
      .setMaterial(mat);
    return doc.createMesh(name).addPrimitive(prim);
  };
  const lid = { top: 'lid_top', bottom: 'base_top', front: 'lid_long', back: 'lid_long', right: 'lid_short', left: 'lid_short' };
  const tray = { top: 'base_top', bottom: 'base_short', front: 'base_long', back: 'base_long', right: 'base_short', left: 'base_short' };
  const card = { top: 'card_top', bottom: 'card_edge', front: 'card_edge', back: 'card_edge', right: 'card_edge', left: 'card_edge' };
  node('pos-top')?.setMesh(make('giftbox-lid', box([-0.06, 0.0, -0.04], [0.06, 0.016, 0.04], lid, atlas)));
  node('pos-bottom')?.setMesh(make('giftbox-tray', box([-0.057, -0.017, -0.038], [0.057, 0.0, 0.038], tray, atlas)));
  // (the board's node is squashed to 0.65 along z: the card is drawn longer there, to come out in its proportions)
  node('pos-pcb')?.setMesh(make('giftbox-card', box([-0.046, 0.0006, -0.031 / 0.65], [0.046, 0.0032, 0.031 / 0.65], card, atlas)));
}

/** the POS counter: the skateboard on it, its truck and its wheels (the reference's skate shop) are taken out of the
 *  wall-and-counter model: every triangle that takes its colour from their corner of the texture (u, v > 0.718) */
async function posCounter(doc) {
  const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === 'env-backwall');
  if (!mesh) return;
  for (const prim of mesh.listPrimitives()) {
    const uv = prim.getAttribute('TEXCOORD_0');
    const idx = prim.getIndices();
    if (!uv || !idx) continue;
    const keep = [];
    const a = [];
    for (let t = 0; t < idx.getCount(); t += 3) {
      const ids = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
      let u = 0;
      let v = 0;
      for (const i of ids) {
        uv.getElement(i, a);
        u += a[0] / 3;
        v += a[1] / 3;
      }
      if (u > 0.718 && v > 0.718) continue;
      keep.push(...ids);
    }
    const Arr = idx.getArray().constructor;
    idx.setArray(new Arr(keep));
  }
}

export const transforms = { posGiftBox, posCounter };
