// The showroom's products (components/Showroom.astro): real things the studio made for its clients, in 3D, one GLB each
// in public/showroom/. The garments are the atelier's sewn shirt (public/tee) made into each one (a polo's collar and
// placket, a sweatshirt's long sleeves) and dressed as made (garment_atlas.mjs); the boxes are cut from their own
// photographs (rivoli_box.py, ...).
//
//   node tools/scenes/remake/products.mjs [id ...]
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { ROOT, boxGeometry, meshOf, teeGeometry, textureFrom, write } from './glbkit.mjs';
import { poloParts, sweatParts } from './garments.mjs';

const WORK = 'D:/RAhpel/.work-raphael/v5-art';
const OUT = path.join(ROOT, 'public/showroom');

/** sRGB hex -> linear [r, g, b, 1] (glTF's colour factors are linear) */
const lin = (hex, k = 1) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow((c / 255) * k, 2.2)).concat(1);
};

function begin() {
  const doc = new Document();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  return { doc, buffer: doc.createBuffer(), scene: doc.createScene('Scene') };
}

async function garment(id, kind, colour) {
  const { doc, buffer, scene } = begin();
  const root = doc.createNode(id);
  scene.addChild(root);
  const tee = teeGeometry();
  const cloth = doc
    .createMaterial(`${id}-cotton`)
    .setBaseColorTexture(await textureFrom(doc, `${id}-atlas`, path.join(WORK, 'products', `${id}-atlas.png`), [1024, 1024]))
    .setRoughnessFactor(0.92)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  root.addChild(doc.createNode(`${id}-body`).setMesh(meshOf(doc, buffer, `${id}-body`, tee.pos, tee.uv, tee.tri, tee.nor, cloth)));
  const plain = doc.createMaterial(`${id}-rib`).setBaseColorFactor(lin(colour, 0.92)).setRoughnessFactor(0.95).setMetallicFactor(0).setDoubleSided(true);
  if (kind === 'polo') {
    const { collar, placket, buttons } = poloParts();
    root.addChild(doc.createNode('collar').setMesh(meshOf(doc, buffer, 'collar', collar.pos, collar.uv, collar.tri, collar.nor, plain)));
    root.addChild(doc.createNode('placket').setMesh(meshOf(doc, buffer, 'placket', placket.pos, placket.uv, placket.tri, placket.nor, plain)));
    const pearl = doc.createMaterial('button').setBaseColorFactor(lin('#efece4')).setRoughnessFactor(0.35).setMetallicFactor(0).setDoubleSided(true);
    for (const [i, b] of buttons.entries()) {
      // a little disc facing the front
      const r = 0.0055;
      const pos = [b[0], b[1], b[2] + 0.001];
      const uv = [0.5, 0.5];
      const tri = [];
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pos.push(b[0] + Math.cos(a) * r, b[1] + Math.sin(a) * r, b[2]);
        uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
        if (k) tri.push(0, k, k + 1);
      }
      root.addChild(doc.createNode(`button-${i}`).setMesh(meshOf(doc, buffer, `button-${i}`, pos, uv, tri, null, pearl)));
    }
  }
  if (kind === 'sweat') {
    for (const [i, s] of sweatParts().entries()) {
      root.addChild(doc.createNode(`sleeve-${i}`).setMesh(meshOf(doc, buffer, `sleeve-${i}`, s.sleeve.pos, s.sleeve.uv, s.sleeve.tri, s.sleeve.nor, plain)));
      root.addChild(doc.createNode(`cuff-${i}`).setMesh(meshOf(doc, buffer, `cuff-${i}`, s.cuff.pos, s.cuff.uv, s.cuff.tri, s.cuff.nor, plain)));
    }
  }
  await write(doc, path.join(OUT, `${id}.glb`));
}

async function rivoli() {
  const { doc, buffer, scene } = begin();
  const b = boxGeometry(0.3, 0.155, 0.2);
  const mat = doc.createMaterial('rivoli').setBaseColorTexture(await textureFrom(doc, 'rivoli', path.join(WORK, 'hero', 'rivoli-atlas.png'))).setRoughnessFactor(0.55).setMetallicFactor(0);
  scene.addChild(doc.createNode('rivoli-box').setMesh(meshOf(doc, buffer, 'rivoli-box', b.pos, b.uv, b.tri, b.nor, mat)));
  await write(doc, path.join(OUT, 'rivoli-box.glb'));
}

const all = {
  'mpg-polo': () => garment('mpg-polo', 'polo', '#18181a'),
  'total-polo': () => garment('total-polo', 'polo', '#1f4fc1'),
  'orange-sweat': () => garment('orange-sweat', 'sweat', '#ff7a00'),
  'raphael-tee': () => garment('raphael-tee', 'tee', '#b9433a'),
  'rivoli-box': rivoli,
};
const ids = process.argv.slice(2).filter((a) => a in all);
for (const id of ids.length ? ids : Object.keys(all)) await all[id]();
