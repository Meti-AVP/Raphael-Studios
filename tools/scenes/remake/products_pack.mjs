// The showroom's packaging (see products.mjs): boxes and bags the studio made, built at their sizes and printed as made.
//   raphael-bag      the studio's own bag: red paper, RAPHAEL STUDIOS, a pair of doors on its front that open onto a
//                    tailor's shop (media/raphael-bag.png); the doors swing open as it comes on the stage
//   oxi-box          Oxi's box: white board printed with carnations and the logo, its lid thrown back, the product
//                    standing in it (media/packaging-stack.jpg)
//   concentrix-box   Concentrix's gift set: a cream box, its lid lifted on the brand's banner, a cork card holder, two
//                    pens and a key ring set in black foam (media/ev-gift-box.jpg)
//
//   node tools/scenes/remake/products_pack.mjs [id ...]
import path from 'node:path';
import sharp from 'sharp';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { ROOT, bagBodyGeometry, channel, meshOf, qAxis, ropeGeometry, textureFrom, write } from './glbkit.mjs';
import { cylinder, faces, roundedBox, slab, torus, tray } from './shapes.mjs';

const WORK = 'D:/RAhpel/.work-raphael/v5-art';
const OUT = path.join(ROOT, 'public/showroom');
const MEDIA = path.join(ROOT, 'src/assets/media');
const LOGOS = path.join(ROOT, 'src/assets/logos');
const A = 1024;

/** sRGB hex -> linear [r, g, b, 1] (glTF's colour factors are linear) */
const lin = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)).concat(1);
};
function begin() {
  const doc = new Document();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  return { doc, buffer: doc.createBuffer(), scene: doc.createScene('Scene') };
}
const add = (doc, buffer, parent, name, g, mat) => {
  const node = doc.createNode(name).setMesh(meshOf(doc, buffer, name, g.pos, g.uv, g.tri, g.nor, mat));
  parent.addChild(node);
  return node;
};
const solid = (doc, name, hex, rough = 0.6, metal = 0) => doc.createMaterial(name).setBaseColorFactor(lin(hex)).setRoughnessFactor(rough).setMetallicFactor(metal);
async function atlas(name, svg, size = A) {
  const file = path.join(WORK, 'products', `${name}-atlas.png`);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  return file;
}
/** a rectangle of the atlas, drawn in millimetres (w x h) as the face is seen from outside, clipped to it */
let clips = 0;
const region = ([u0, v0, u1, v1], w, h, content, S = A) => {
  const id = `r${clips++}`;
  return `<clipPath id="${id}"><rect x="${u0 * S}" y="${v0 * S}" width="${(u1 - u0) * S}" height="${(v1 - v0) * S}"/></clipPath>
    <g clip-path="url(#${id})"><g transform="translate(${u0 * S} ${v0 * S}) scale(${((u1 - u0) * S) / w} ${((v1 - v0) * S) / h})">${content}</g></g>`;
};
/** a client's logo (its silhouette, src/assets/logos) in one colour, as an image to set in an SVG */
async function logo(name, hex) {
  const im = sharp(path.join(LOGOS, `${name}.png`)).ensureAlpha();
  const { width, height } = await im.metadata();
  const alpha = await im.clone().extractChannel(3).toBuffer();
  const n = parseInt(hex.slice(1), 16);
  const png = await sharp({ create: { width, height, channels: 3, background: { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 } } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return { href: `data:image/png;base64,${png.toString('base64')}`, aspect: width / height };
}
const img = (l, x, y, w, extra = '') => `<image href="${l.href}" x="${x}" y="${y}" width="${w}" height="${w / l.aspect}" preserveAspectRatio="none" ${extra}/>`;
/** a seeded random (the prints are the same each time they are made) */
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------------------------------------------------------------------------------------------------- raphael-bag
async function raphaelBag() {
  const { doc, buffer, scene } = begin();
  const HERO = path.join(WORK, 'hero'); // (its pictures are cut from the photograph by hero_v5.mjs)
  // the paper's red, from the photograph's plain upper corner
  const { data, info } = await sharp(path.join(MEDIA, 'raphael-bag.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 318; y < 360; y++)
    for (let x = 222; x < 280; x++) {
      const k = (y * info.width + x) * 3;
      r += data[k];
      g += data[k + 1];
      b += data[k + 2];
      n++;
    }
  const red = [r / n / 255, g / n / 255, b / n / 255].map((c) => Math.pow(c, 2.2)).concat(1);
  const [bw, bh, bd] = [0.34, 0.44, 0.13];
  const dw = { x0: (345 - 210) / 470, y0: (528 - 290) / 640, x1: (590 - 210) / 470, y1: (903 - 290) / 640 };
  const root = doc.createNode('raphael-bag');
  scene.addChild(root);
  const paper = doc.createMaterial('bag-paper').setBaseColorTexture(await textureFrom(doc, 'bag-front', path.join(HERO, 'bag-front.png'))).setRoughnessFactor(0.5).setMetallicFactor(0).setDoubleSided(true);
  const plain = doc.createMaterial('bag-plain').setBaseColorFactor(red).setRoughnessFactor(0.52).setMetallicFactor(0).setDoubleSided(true);
  // the front with the doorway cut out of it (four bands round it)
  const [x0, x1] = [-bw / 2 + dw.x0 * bw, -bw / 2 + dw.x1 * bw];
  const [y0, y1] = [bh * (1 - dw.y1), bh * (1 - dw.y0)];
  const fz = bd / 2;
  const U = (x) => (x + bw / 2) / bw;
  const V = (y) => 1 - y / bh;
  const front = faces();
  const band = (ax, ay, bx, by) => front.quad([ax, by, fz], [bx, by, fz], [ax, ay, fz], [bx, ay, fz], [U(ax), V(by), U(bx), V(ay)]);
  band(-bw / 2, y1, bw / 2, bh);
  band(-bw / 2, 0, bw / 2, y0);
  band(-bw / 2, y0, x0, y1);
  band(x1, y0, bw / 2, y1);
  add(doc, buffer, root, 'bag-front', front.out(), paper);
  // the rest of the bag (its own front dropped: the banded one stands for it)
  const rest = bagBodyGeometry(bw, bh, bd);
  add(doc, buffer, root, 'bag-shell', { pos: rest.pos.slice(12), uv: rest.uv.slice(8), nor: rest.nor.slice(12), tri: rest.tri.slice(6).map((i) => i - 4) }, plain);
  // inside: the shop, lit, set back behind the doorway, in a dark box
  const sz = fz - bd * 0.55;
  const shop = doc.createMaterial('bag-shop').setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([0.95, 0.95, 0.95]).setEmissiveTexture(await textureFrom(doc, 'shop', path.join(HERO, 'bag-shop.png')));
  add(doc, buffer, root, 'bag-shop', faces().quad([x0, y1, sz], [x1, y1, sz], [x0, y0, sz], [x1, y0, sz], [0, 0, 1, 1]).out(), shop);
  const dark = solid(doc, 'bag-dark', '#1a0806', 1).setDoubleSided(true);
  const jambs = faces()
    .quad([x0, y1, sz], [x0, y1, fz], [x0, y0, sz], [x0, y0, fz], [0, 0, 1, 1])
    .quad([x1, y1, fz], [x1, y1, sz], [x1, y0, fz], [x1, y0, sz], [0, 0, 1, 1])
    .quad([x0, y1, sz], [x1, y1, sz], [x0, y1, fz], [x1, y1, fz], [0, 0, 1, 1])
    .quad([x0, y0, fz], [x1, y0, fz], [x0, y0, sz], [x1, y0, sz], [0, 0, 1, 1])
    .out();
  add(doc, buffer, root, 'bag-jambs', jambs, dark);
  // the two doors, hinged on the doorway's sides: painted outside, plain red within
  const door = doc.createMaterial('bag-door').setBaseColorTexture(await textureFrom(doc, 'door', path.join(HERO, 'bag-door.png'))).setRoughnessFactor(0.55).setMetallicFactor(0);
  const doorBack = doc.createMaterial('bag-door-back').setBaseColorFactor(red).setRoughnessFactor(0.6).setMetallicFactor(0);
  const hw = (x1 - x0) / 2;
  const doors = [];
  for (const [side, hinge] of [[-1, x0], [1, x1]]) {
    const node = doc.createNode(side < 0 ? 'door-l' : 'door-r').setTranslation([hinge, 0, fz + 0.002]);
    root.addChild(node);
    // (the left door's leaf runs right of its hinge, the right's left of it; the left one shows the picture mirrored)
    const [a, b] = side < 0 ? [0, hw] : [-hw, 0];
    const uvs = side < 0 ? [1, 0, 0, 1] : [0, 0, 1, 1];
    add(doc, buffer, node, 'door', faces().quad([a, y1, 0], [b, y1, 0], [a, y0, 0], [b, y0, 0], uvs).out(), door);
    add(doc, buffer, node, 'door-back', faces().quad([b, y1, -0.0015], [a, y1, -0.0015], [b, y0, -0.0015], [a, y0, -0.0015], [0, 0, 1, 1]).out(), doorBack);
    doors.push([node, side]);
  }
  // they open once the bag is on the stage (the showroom plays a model's clips once), slowly, with a little settle
  const anim = doc.createAnimation('open');
  for (const [node, side] of doors) {
    const times = [0];
    const keys = [qAxis([0, 1, 0], 0)];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      const e = t < 0.75 ? 1.06 * (1 - Math.pow(1 - t / 0.75, 3)) : 1.06 - 0.06 * Math.sin(((t - 0.75) / 0.25) * Math.PI * 0.5);
      times.push(0.9 + t * 1.6);
      keys.push(qAxis([0, 1, 0], side * 1.25 * e));
    }
    channel(doc, buffer, anim, node, 'rotation', times, keys, 'VEC4');
  }
  // the rope handles, front and back, from eyelets under the top edge; the eyelets
  const rope = solid(doc, 'bag-rope', '#4a4038', 0.85);
  const eyelet = solid(doc, 'eyelet', '#b9b4aa', 0.3, 1);
  for (const z of [fz - 0.004, -fz + 0.004]) {
    const a = [-bw * 0.16, bh - 0.022, z];
    const b = [bw * 0.16, bh - 0.022, z];
    add(doc, buffer, root, 'rope', ropeGeometry(a, b, 0.14, 0.0042), rope);
    for (const p of [a, b])
      add(doc, buffer, root, 'eyelet', torus(0.0065, 0.0016, { segs: 20, sides: 6 }), eyelet)
        .setTranslation([p[0], p[1], z + Math.sign(z) * 0.0025])
        .setRotation(qAxis([1, 0, 0], Math.PI / 2));
  }
  await write(doc, path.join(OUT, 'raphael-bag.glb'));
}

// ------------------------------------------------------------------------------------------------------- oxi-box
/** a carnation seen from above, in deep pink: three rings of fringed petals and a dark heart */
const carnation = (cx, cy, R, rot, rand) => {
  const ring = (rr, k, jag) => {
    const pts = [];
    for (let i = 0; i < k * 2; i++) {
      const a = (i / (k * 2)) * Math.PI * 2;
      const q = rr * (i % 2 ? 1 - jag : 1) * (0.92 + rand() * 0.16);
      pts.push(`${(Math.cos(a) * q).toFixed(2)},${(Math.sin(a) * q).toFixed(2)}`);
    }
    return pts.join(' ');
  };
  return `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(1)})" filter="url(#petal)">
    <polygon points="${ring(R, 20, 0.16)}" fill="#b3125d"/>
    <polygon points="${ring(R * 0.74, 16, 0.2)}" fill="#c81f6c"/>
    <polygon points="${ring(R * 0.5, 12, 0.24)}" fill="#9a0c4c"/>
    <polygon points="${ring(R * 0.28, 9, 0.3)}" fill="#cf3a7c"/>
    <circle r="${(R * 0.1).toFixed(2)}" fill="#6d0835"/></g>`;
};
async function oxiBox() {
  const { doc, buffer, scene } = begin();
  const blue = await logo('oxi', '#1c3f94');
  const W = 200, H = 150, D = 200; // mm
  const F = {
    front: [0, 0, 0.5, 0.375],
    back: [0.5, 0, 1, 0.375],
    right: [0, 0.375, 0.5, 0.75],
    left: [0.5, 0.375, 1, 0.75],
    lid: [0, 0.75, 0.25, 1],
    flap: [0.25, 0.75, 0.75, 0.8125],
    inside: [0.77, 0.77, 0.98, 0.98],
  };
  // each face its own scatter of flowers (some running off its edges) and logos, turned every way
  const print = (w, h, seed, flowers, logos) => {
    const rand = rng(seed);
    // (each placed where it keeps its distance from those already there: a scatter, not a clump)
    const placed = [];
    const spot = (x0, x1, y0, y1, gap) => {
      let best = null;
      for (let k = 0; k < 60; k++) {
        const q = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
        const d = Math.min(...placed.map((o) => Math.hypot(o[0] - q[0], o[1] - q[1])), 1e9);
        if (!best || d > best[1]) best = [q, d];
        if (d > gap) break;
      }
      placed.push(best[0]);
      return best[0];
    };
    let s = `<rect width="${w}" height="${h}" fill="#fbfbf9"/>`;
    for (let i = 0; i < flowers; i++) {
      const [x, y] = spot(-0.08 * w, 1.08 * w, -0.08 * h, 1.08 * h, 70);
      s += carnation(x, y, 25 + rand() * 9, rand() * 360, rand);
    }
    for (let i = 0; i < logos; i++) {
      const lw = 40 + rand() * 8;
      const [x, y] = spot(26, w - 26, 22, h - 22, 58);
      s += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-70 + rand() * 140).toFixed(1)})">${img(blue, -lw / 2, -lw / blue.aspect / 2, lw)}</g>`;
    }
    return s;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${A}"><defs>
      <filter id="petal"><feTurbulence type="fractalNoise" baseFrequency="0.25" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter>
      <filter id="fibre"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.08" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.24  0 0 0 0 0.13  0 0 0 0.35 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>
    <rect width="${A}" height="${A}" fill="#fbfbf9"/>
    ${region(F.front, W, H, print(W, H, 11, 3, 2))}
    ${region(F.back, W, H, print(W, H, 23, 3, 2))}
    ${region(F.right, D, H, print(D, H, 37, 3, 2))}
    ${region(F.left, D, H, print(D, H, 41, 3, 2))}
    ${region(F.lid, W, D, print(W, D, 53, 4, 3))}
    ${region(F.flap, W, 35, print(W, 35, 67, 2, 1))}
    <rect x="${0.75 * A}" y="${0.75 * A}" width="${0.25 * A}" height="${0.25 * A}" fill="#b98f61"/>
    <rect x="${0.75 * A}" y="${0.75 * A}" width="${0.25 * A}" height="${0.25 * A}" filter="url(#fibre)"/></svg>`;
  const board = doc.createMaterial('oxi-board').setBaseColorTexture(await textureFrom(doc, 'oxi', await atlas('oxi-box', svg))).setRoughnessFactor(0.48).setMetallicFactor(0);
  const root = doc.createNode('oxi-box');
  scene.addChild(root);
  const [w, h, d, t] = [W / 1000, H / 1000, D / 1000, 0.003];
  add(doc, buffer, root, 'box', tray(w, h, d, t, { front: F.front, back: F.back, right: F.right, left: F.left, bottom: F.inside, inside: F.inside }), board);
  // the lid, hinged along the back's top edge and thrown back past upright; its tuck flap at its front edge
  const lid = doc.createNode('lid').setTranslation([0, h, -d / 2]).setRotation(qAxis([1, 0, 0], -1.98));
  root.addChild(lid);
  const lidFaces = { top: F.lid, bottom: F.inside, front: F.inside, back: F.inside, right: F.inside, left: F.inside };
  add(doc, buffer, lid, 'lid-panel', slab(w, t, d, lidFaces), board).setTranslation([0, 0, d / 2]);
  add(doc, buffer, lid, 'lid-flap', slab(w, 0.035, t, { front: F.flap, back: F.inside, right: F.inside, left: F.inside, top: F.inside, bottom: F.inside }), board).setTranslation([0, -0.035 + t, d - t / 2]);
  // the product standing in it: a pillow pack in Oxi's crimson, its tag on the front
  const P = 512;
  const pouchSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${P}" height="${P}"><defs>
      <linearGradient id="cr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d0153a"/><stop offset="1" stop-color="#9d0c46"/></linearGradient></defs>
    <rect width="${P}" height="${P}" fill="url(#cr)"/>
    ${region([0, 0, 0.5, 0.75], 150, 210, `<rect width="150" height="210" fill="url(#cr)"/>
      <path d="M -10 150 C 40 120 90 190 160 140 L 160 220 L -10 220 Z" fill="#ffffff" opacity="0.16"/>
      <path d="M -10 168 C 50 140 100 200 160 160" fill="none" stroke="#ffffff" stroke-width="2.4" opacity="0.6"/>
      <g transform="translate(78 66) rotate(-13)"><rect x="-38" y="-27" width="76" height="54" rx="9" fill="#ffffff"/>${img(blue, -31, -31 / blue.aspect + 1, 62)}</g>
      <rect x="28" y="118" width="94" height="6" rx="3" fill="#ffffff" opacity="0.85"/>
      <rect x="44" y="130" width="62" height="4" rx="2" fill="#ffffff" opacity="0.6"/>`, P)}
    ${region([0.5, 0, 1, 0.75], 150, 210, `<rect width="150" height="210" fill="url(#cr)"/>
      ${Array.from({ length: 9 }, (_, i) => `<rect x="24" y="${60 + i * 11}" width="${102 - (i % 3) * 18}" height="3.2" rx="1.6" fill="#ffffff" opacity="0.55"/>`).join('')}
      <rect x="24" y="170" width="52" height="22" fill="#ffffff"/>${Array.from({ length: 16 }, (_, i) => `<rect x="${27 + i * 3}" y="173" width="${i % 3 ? 1.2 : 2}" height="16" fill="#111"/>`).join('')}`, P)}
    ${region([0, 0.75, 1, 1], 300, 50, Array.from({ length: 60 }, (_, i) => `<rect x="${i * 5}" y="0" width="2.4" height="50" fill="#7e0a37" opacity="0.5"/>`).join(''), P)}
  </svg>`;
  const pouchMat = doc.createMaterial('oxi-pack').setBaseColorTexture(await textureFrom(doc, 'pack', await atlas('oxi-pack', pouchSvg, P))).setRoughnessFactor(0.32).setMetallicFactor(0);
  const crimp = [0, 0.75, 1, 1];
  const pack = roundedBox(0.14, 0.2, 0.04, 0.012, { front: [0, 0, 0.5, 0.75], back: [0.5, 0, 1, 0.75], right: crimp, left: crimp, top: crimp, bottom: crimp }, { n: 18, soft: 0.45 });
  add(doc, buffer, root, 'pack', pack, pouchMat).setTranslation([0.004, t + 0.1, 0.012]).setRotation(qAxis([0, 1, 0], 0.12));
  await write(doc, path.join(OUT, 'oxi-box.glb'));
}

// ------------------------------------------------------------------------------------------------ concentrix-box
async function concentrixBox() {
  const { doc, buffer, scene } = begin();
  const white = await logo('concentrix', '#ffffff');
  const burnt = await logo('concentrix', '#5a3a1c');
  const R = {
    banner: [0, 0, 0.75, 0.5], // the lid's inside (280 x 200 mm)
    cream: [0.77, 0.02, 0.98, 0.23],
    foam: [0.77, 0.27, 0.98, 0.48],
    cork: [0, 0.5, 0.375, 0.78], // the card holder's face (95 x 70 mm)
    corkPlain: [0.02, 0.8, 0.35, 0.98],
    pen: [0.375, 0.5, 1, 0.56], // the wooden pen's barrel (130 mm along, round it)
    wood: [0.4, 0.6, 0.98, 0.7],
  };
  // the brand's mark: a ring of its colours (as on its banner)
  const mark = (cx, cy, r) => {
    const cols = ['#ff3f7f', '#ff8a00', '#ffd400', '#21c7a8', '#2d6cdf', '#8b3fd9'];
    return cols
      .map((c, i) => {
        const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
        return `<path d="M ${cx} ${cy} L ${(cx + Math.cos(a0) * r).toFixed(2)} ${(cy + Math.sin(a0) * r).toFixed(2)} A ${r} ${r} 0 0 1 ${(cx + Math.cos(a1) * r).toFixed(2)} ${(cy + Math.sin(a1) * r).toFixed(2)} Z" fill="${c}"/>`;
      })
      .join('') + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.38).toFixed(2)}" fill="#13235b"/>`;
  };
  const corkFill = (w, h) => `<rect width="${w}" height="${h}" fill="#c9a06a"/><rect width="${w}" height="${h}" filter="url(#cork)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${A}"><defs>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.28  0 0 0 0.12 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="cork"><feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="3" seed="12"/><feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.26  0 0 0 0 0.12  0 0 0 0.9 -0.25"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="wood"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.6" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.33  0 0 0 0 0.17  0 0 0 0.45 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="burn"><feGaussianBlur stdDeviation="0.25"/></filter></defs>
    <rect width="${A}" height="${A}" fill="#eadfc8"/>
    <rect width="${A}" height="${A}" filter="url(#grain)"/>
    ${region(R.banner, 280, 200, `<rect width="280" height="200" fill="#eadfc8"/>
      <rect x="28" y="62" width="224" height="50" rx="25" fill="#13235b"/>
      <rect x="28" y="62" width="224" height="50" rx="25" fill="none" stroke="#2d6cdf" stroke-width="1.2" opacity="0.6"/>
      ${mark(54, 87, 16)}
      ${img(white, 78, 87 - 112 / white.aspect / 2 - 2, 112)}
      <rect x="206" y="72" width="34" height="30" rx="6" fill="#4bb3e6"/><path d="M 210 98 L 222 82 L 230 92 L 236 86 L 240 98 Z" fill="#ffd400"/><circle cx="231" cy="79" r="3.2" fill="#ff3f7f"/>`)}
    <rect x="${R.foam[0] * A}" y="${R.foam[1] * A}" width="${(R.foam[2] - R.foam[0]) * A}" height="${(R.foam[3] - R.foam[1]) * A}" fill="#151515"/>
    ${region(R.cork, 95, 70, `${corkFill(95, 70)}<g filter="url(#burn)" opacity="0.85">${img(burnt, 26, 16, 44)}</g>`)}
    ${region(R.corkPlain, 95, 50, corkFill(95, 50))}
    ${region(R.pen, 130, 33, `<rect width="130" height="33" fill="#d9b382"/><rect width="130" height="33" filter="url(#wood)"/><g filter="url(#burn)" opacity="0.9">${img(burnt, 40, 16.5 - 30 / burnt.aspect / 2, 30)}</g>`)}
    ${region(R.wood, 120, 40, `<rect width="120" height="40" fill="#d9b382"/><rect width="120" height="40" filter="url(#wood)"/>`)}
  </svg>`;
  const mat = doc.createMaterial('concentrix').setBaseColorTexture(await textureFrom(doc, 'concentrix', await atlas('concentrix-box', svg))).setRoughnessFactor(0.7).setMetallicFactor(0);
  const black = solid(doc, 'black', '#121212', 0.35);
  const gold = solid(doc, 'gold', '#d8b25a', 0.28, 1);
  const steel = solid(doc, 'steel', '#c9cbcf', 0.25, 1);
  const root = doc.createNode('concentrix-box');
  scene.addChild(root);
  const [w, h, d, t] = [0.28, 0.055, 0.2, 0.004];
  add(doc, buffer, root, 'box', tray(w, h, d, t, { front: R.cream, back: R.cream, right: R.cream, left: R.cream, bottom: R.cream, inside: R.cream }), mat);
  // the foam, a little below the rim
  const yf = h - 0.008;
  add(doc, buffer, root, 'foam', slab(w - 2 * t, yf - t, d - 2 * t, R.foam), mat).setTranslation([0, t, 0]);
  // the lid, hinged at the back and lifted a little past upright: the banner inside it, facing the reader
  const lid = doc.createNode('lid').setTranslation([0, h, -d / 2]).setRotation(qAxis([1, 0, 0], -1.78));
  root.addChild(lid);
  add(doc, buffer, lid, 'lid-panel', slab(w, 0.006, d, { top: R.cream, bottom: R.banner, front: R.cream, back: R.cream, right: R.cream, left: R.cream }), mat).setTranslation([0, 0, d / 2]);
  // the card holder (cork, the brand burnt into it, a black band across its foot)
  const card = doc.createNode('card').setTranslation([-0.045, yf - 0.002, -0.018]);
  root.addChild(card);
  add(doc, buffer, card, 'cork', slab(0.095, 0.007, 0.07, { top: R.cork, bottom: R.corkPlain, front: R.corkPlain, back: R.corkPlain, right: R.corkPlain, left: R.corkPlain }), mat);
  add(doc, buffer, card, 'band', slab(0.052, 0.0035, 0.03, [0, 0, 1, 1]), black).setTranslation([0.004, 0.007, 0.024]);
  // the pens, lying across the front: one of wood with the brand burnt along it (round its underside as made, so turned
  // over to show it), one black with a wooden grip
  const pen1 = doc.createNode('pen-wood').setTranslation([-0.01, yf + 0.0035, 0.05]).setRotation(qAxis([1, 0, 0], Math.PI));
  root.addChild(pen1);
  add(doc, buffer, pen1, 'barrel', cylinder(0.0052, 0.118, { uv: R.pen }), mat).setTranslation([-0.006, 0, 0]);
  add(doc, buffer, pen1, 'tip', cylinder(0.0052, 0.016, { r1: 0.0012 }), steel).setTranslation([0.061, 0, 0]);
  add(doc, buffer, pen1, 'cap', cylinder(0.0054, 0.012, {}), steel).setTranslation([-0.07, 0, 0]);
  add(doc, buffer, pen1, 'clip', slab(0.042, 0.0016, 0.0028, [0, 0, 1, 1]), steel).setTranslation([-0.05, -0.0066, 0]);
  const pen2 = doc.createNode('pen-black').setTranslation([-0.004, yf + 0.0032, 0.074]);
  root.addChild(pen2);
  add(doc, buffer, pen2, 'barrel', cylinder(0.0048, 0.1, {}), black).setTranslation([-0.02, 0, 0]);
  add(doc, buffer, pen2, 'grip', cylinder(0.0049, 0.034, { uv: [R.wood[0], R.wood[1], R.wood[2], R.wood[1] + 0.02] }), mat).setTranslation([0.047, 0, 0]);
  add(doc, buffer, pen2, 'tip', cylinder(0.0049, 0.014, { r1: 0.001 }), steel).setTranslation([0.071, 0, 0]);
  // the key ring: a wooden tag, a gold plate, the ring
  const key = doc.createNode('key').setTranslation([0.1, yf, -0.005]).setRotation(qAxis([0, 1, 0], -0.08));
  root.addChild(key);
  add(doc, buffer, key, 'wood', slab(0.026, 0.005, 0.05, { top: R.wood, bottom: R.wood, front: R.wood, back: R.wood, right: R.wood, left: R.wood }), mat).setTranslation([0, -0.001, 0.032]);
  add(doc, buffer, key, 'plate', slab(0.02, 0.003, 0.032, [0, 0, 1, 1]), gold).setTranslation([0, 0, -0.008]);
  add(doc, buffer, key, 'ring', torus(0.0135, 0.0018, { segs: 36, sides: 8 }), steel).setTranslation([0, 0.0015, -0.036]);
  await write(doc, path.join(OUT, 'concentrix-box.glb'));
}

const all = { 'raphael-bag': raphaelBag, 'oxi-box': oxiBox, 'concentrix-box': concentrixBox };
const ids = process.argv.slice(2).filter((a) => a in all);
for (const id of ids.length ? ids : Object.keys(all)) await all[id]();
