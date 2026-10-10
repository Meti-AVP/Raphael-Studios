// The showroom's giveaways (see products.mjs): soft goods the studio made, modelled at their sizes and printed as made.
//   star-waistbag   yellow, a big blue star, a black strap and buckle
//   star-duffle     navy, a yellow end panel with a white star, yellow handles
//   sunny-cooler    a white soft cooler printed "Welcome to the Sunny Side", a turquoise handle, striped piping
//   trevi-blanket   a white fleece rolled up in a black leather strap, "Castello di Trevi" embroidered
import path from 'node:path';
import sharp from 'sharp';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { ROOT, meshOf, textureFrom, write, v3 } from './glbkit.mjs';
import { roundedBox, strap, roll, rollPoint } from './shapes.mjs';
import { stripGeometry } from './garments.mjs';

const WORK = 'D:/RAhpel/.work-raphael/v5-art/products';
const OUT = path.join(ROOT, 'public/showroom');
const lin = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)).concat(1);
};
const A = 1024;
/** the rounded box's faces in one atlas: front and back side by side on top, the ends, the top and the bottom below */
const LAYOUT = {
  front: [0, 0, 0.5, 0.5],
  back: [0.5, 0, 1, 0.5],
  right: [0, 0.5, 0.25, 1],
  left: [0.25, 0.5, 0.5, 1],
  top: [0.5, 0.5, 1, 0.75],
  bottom: [0.5, 0.75, 1, 1],
};
const star = (cx, cy, R, fill, rot = -Math.PI / 2) => {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? R * 0.42 : R;
    const a = rot + (k * Math.PI) / 5;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};
/** a fabric's weave and a little shading, over everything */
const weave = (id) => `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
/**
 * one face of a rounded box, drawn in millimetres as it is seen from outside (x to the right, y down, the face w x h mm)
 * and set on its rectangle of the atlas (clipped to it): what is round stays round, whatever the rectangle's shape
 */
let faces = 0;
const face = (rect, w, h, content) => {
  const [u0, v0, u1, v1] = rect;
  const id = `face${faces++}`;
  return `<clipPath id="${id}"><rect x="${u0 * A}" y="${v0 * A}" width="${(u1 - u0) * A}" height="${(v1 - v0) * A}"/></clipPath>
    <g clip-path="url(#${id})"><g transform="translate(${u0 * A} ${v0 * A}) scale(${((u1 - u0) * A) / w} ${((v1 - v0) * A) / h})">${content}</g></g>`;
};
/** the six faces of a box w x h x d (mm), each drawn by its own function (w, h) => svg */
const boxFaces = (w, h, d, draw) =>
  Object.entries({ front: [w, h], back: [w, h], right: [d, h], left: [d, h], top: [w, d], bottom: [w, d] })
    .map(([k, [fw, fh]]) => face(LAYOUT[k], fw, fh, draw[k] ? draw[k](fw, fh) : ''))
    .join('');
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
async function atlas(name, svg) {
  const file = path.join(WORK, `${name}-atlas.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}
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
const plain = { front: [0, 0, 1, 1], back: [0, 0, 1, 1], right: [0, 0, 1, 1], left: [0, 0, 1, 1], top: [0, 0, 1, 1], bottom: [0, 0, 1, 1] };
/** a rotation turning +z to the direction n (unit), about the axis between them */
const facing = (n) => {
  const axis = v3.cross([0, 0, 1], n);
  const s = v3.len(axis);
  if (s < 1e-6) return n[2] > 0 ? [0, 0, 0, 1] : [1, 0, 0, 0];
  const a = Math.atan2(s, n[2]);
  const k = Math.sin(a / 2) / s;
  return [axis[0] * k, axis[1] * k, axis[2] * k, Math.cos(a / 2)];
};

// ---------------------------------------------------------------------------------------------------------- the bags
async function waistbag() {
  // a bum bag as the studio's: a padded pouch (a big blue star on its front, piped in a deeper yellow, zipped along its
  // top) between two wings that taper to the belt; the whole bent round the waist it is worn on, the black webbing belt
  // closing behind with a side-release buckle
  const Y = '#f3c418';
  const Yd = '#d9a90c';
  const B = '#1f4fb5';
  const W = 400, H = 140, D = 70; // mm
  const P0 = 112, P1 = 288; // the pouch's sides (mm from the left)
  const zip = (x0, x1, y) => `<rect x="${x0}" y="${y - 2.2}" width="${x1 - x0}" height="4.4" rx="2" fill="#1c1c1c"/>
    <rect x="${x0}" y="${y - 0.6}" width="${x1 - x0}" height="1.2" fill="#444"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${A}"><defs>${weave('w')}</defs>
    <rect width="${A}" height="${A}" fill="${Y}"/>
    ${boxFaces(W, H, D, {
      front: () => `<rect x="${P0}" y="9" width="${P1 - P0}" height="${H - 18}" rx="24" fill="none" stroke="${Yd}" stroke-width="3.2"/>
        <rect x="${P0 + 5}" y="14" width="${P1 - P0 - 10}" height="${H - 28}" rx="20" fill="none" stroke="#b78d06" stroke-width="0.7" stroke-dasharray="3 2.4" opacity="0.7"/>
        ${star((P0 + P1) / 2, H / 2 + 3, 57, B, -Math.PI / 2 + 0.1)}`,
      back: (w, h) => `<rect x="${W - P1}" y="12" width="${P1 - P0}" height="${h - 24}" rx="20" fill="none" stroke="${Yd}" stroke-width="2"/>`,
      top: (w, h) => `${zip(P0 + 8, P1 - 8, h / 2)}
        <rect x="${P0 + 18}" y="${h / 2 - 5}" width="9" height="20" rx="3" fill="#202020"/>`,
    })}
    <rect width="${A}" height="${A}" filter="url(#w)"/></svg>`;
  const { doc, buffer, scene } = begin();
  const tex = await textureFrom(doc, 'waistbag', await atlas('star-waistbag', svg));
  const cloth = doc.createMaterial('waistbag-cloth').setBaseColorTexture(tex).setRoughnessFactor(0.7).setMetallicFactor(0);
  const root = doc.createNode('star-waistbag');
  scene.addChild(root);
  // the waist: an ellipse (half-widths ax, bz) whose front passes through the bag's middle
  const ax = 0.25, bz = 0.17, zc = -bz;
  const waist = (x) => zc + bz * Math.sqrt(Math.max(0, 1 - (x / ax) ** 2));
  const warp = ([x, y, z]) => {
    const t = smooth(0.09, 0.2, Math.abs(x));
    const k = 1 - 0.68 * t; // the wings taper to the belt
    return [x, y * k + 0.004 * t, z * k + waist(x) - waist(0)];
  };
  add(doc, buffer, root, 'body', roundedBox(W / 1000, H / 1000, D / 1000, 0.03, LAYOUT, { n: 36, soft: 0.45, warp }), cloth);
  // the belt: from one wing's tip round the waist behind to the other's, upright, facing out
  const black = doc.createMaterial('strap').setBaseColorFactor(lin('#151515')).setRoughnessFactor(0.85).setMetallicFactor(0).setDoubleSided(true);
  const f0 = Math.acos(0.2 / ax);
  const belt = [];
  for (let k = 0; k <= 80; k++) {
    const f = f0 - (k / 80) * (Math.PI * 2 - 2 * f0);
    belt.push([ax * Math.cos(f), 0.004, zc + bz * Math.sin(f)]);
  }
  const out = (q) => v3.norm([q[0] / (ax * ax), 0, (q[2] - zc) / (bz * bz)]);
  add(doc, buffer, root, 'strap', strap(belt, 0.038, out), black);
  // the buckle, at the back: two halves meeting, a hair proud of the belt
  const buckle = doc.createMaterial('buckle').setBaseColorFactor(lin('#0b0b0b')).setRoughnessFactor(0.35).setMetallicFactor(0);
  for (const [x, w] of [[-0.022, 0.044], [0.024, 0.04]])
    add(doc, buffer, root, 'buckle', roundedBox(w, x < 0 ? 0.05 : 0.044, 0.014, 0.005, plain, { n: 4 }), buckle)
      .setTranslation([x, 0.004, zc - bz - 0.006])
      .setRotation([0, 1, 0, 0]);
  await write(doc, path.join(OUT, 'star-waistbag.glb'));
}

async function duffle() {
  // navy canvas, the right end a yellow panel (a white star on it) carried a hand's width round onto the front and the
  // back, a small yellow star at the front's left; yellow handles stitched down both sides, arching over the top
  const N = '#22305a';
  const Y = '#efb526';
  const W = 500, H = 280, D = 250;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${A}"><defs>${weave('w')}</defs>
    <rect width="${A}" height="${A}" fill="${N}"/>
    ${boxFaces(W, H, D, {
      front: (w, h) => `<rect x="${w - 118}" y="0" width="118" height="${h}" fill="${Y}"/>
        ${star(w - 58, h * 0.55, 46, '#ffffff', -Math.PI / 2 + 0.22)}
        ${star(44, h * 0.53, 26, Y, -Math.PI / 2 + 0.18)}`,
      back: (w, h) => `<rect x="0" y="0" width="118" height="${h}" fill="${Y}"/>${star(58, h * 0.55, 46, '#ffffff', -Math.PI / 2 - 0.22)}`,
      right: (w, h) => `<rect width="${w}" height="${h}" fill="${Y}"/>${star(w / 2, h / 2 + 4, 82, '#ffffff', -Math.PI / 2 + 0.05)}`,
      top: (w, h) => `<rect x="${w - 118}" y="0" width="118" height="${h}" fill="${Y}"/>
        <rect x="40" y="${h / 2 - 3}" width="${w - 80}" height="6" rx="3" fill="#0e1428"/>
        <rect x="58" y="${h / 2 - 4}" width="10" height="24" rx="3" fill="#c9cdd6"/>`,
      bottom: (w, h) => `<rect x="${w - 118}" y="0" width="118" height="${h}" fill="${Y}"/><rect width="${w - 118}" height="${h}" fill="#1a2547"/>`,
    })}
    <rect width="${A}" height="${A}" filter="url(#w)"/></svg>`;
  const { doc, buffer, scene } = begin();
  const tex = await textureFrom(doc, 'duffle', await atlas('star-duffle', svg));
  const cloth = doc.createMaterial('duffle-cloth').setBaseColorTexture(tex).setRoughnessFactor(0.72).setMetallicFactor(0);
  const root = doc.createNode('star-duffle');
  scene.addChild(root);
  add(doc, buffer, root, 'body', roundedBox(W / 1000, H / 1000, D / 1000, 0.06, LAYOUT, { soft: 0.45 }), cloth);
  // the handles: yellow straps down the front and the back, rising in an arch over the top
  const yellow = doc.createMaterial('handles').setBaseColorFactor(lin(Y)).setRoughnessFactor(0.75).setMetallicFactor(0).setDoubleSided(true);
  for (const z of [0.127, -0.127]) {
    for (const x of [-0.09, 0.09]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) pts.push([x, -0.12 + (0.25 * k) / 10, z + Math.sign(z) * 0.004]);
      add(doc, buffer, root, 'strap', strap(pts, 0.03, [0, 0, Math.sign(z)]), yellow);
    }
    const arch = [];
    for (let k = 0; k <= 24; k++) {
      const a = Math.PI * (k / 24);
      arch.push([-0.09 * Math.cos(a), 0.13 + Math.sin(a) * 0.13, z * 0.92]);
    }
    add(doc, buffer, root, 'handle', strap(arch, 0.03, [0, 0, 1]), yellow);
  }
  await write(doc, path.join(OUT, 'star-duffle.glb'));
}

async function cooler() {
  // a soft white cooler: on its front an arched WELCOME over a rising sun, TO THE / SUNNY SIDE, all red; orange striped
  // piping down its four upright edges; a zipped lid, a turquoise webbing loop to carry it by, front to back
  const red = '#d42a2c';
  const W = 260, H = 240, D = 200;
  const font = 'font-family="Arial Rounded MT Bold, Arial Black, Arial, sans-serif" font-weight="900"';
  // (the renderer draws no textPath: the letters are set one by one round the arc, each turned to it)
  const widths = { W: 1.0, E: 0.67, L: 0.61, C: 0.72, O: 0.78, M: 0.94 };
  const arcText = (word, cx, cy, r, size, fill) => {
    const adv = [...word].map((ch) => (widths[ch] ?? 0.7) * size + 1.6);
    const total = adv.reduce((x, y) => x + y, 0);
    let at = -total / 2;
    return [...word].map((ch, k) => {
      const t = (at + adv[k] / 2) / r;
      at += adv[k];
      const x = cx + Math.sin(t) * r, y = cy - Math.cos(t) * r;
      return `<text x="0" y="0" text-anchor="middle" ${font} font-size="${size}" fill="${fill}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((t * 180) / Math.PI).toFixed(2)})">${ch}</text>`;
    }).join('');
  };
  const stripes = `<pattern id="stripes" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="7" height="7" fill="#fbfaf6"/><rect width="3.6" height="7" fill="#f28a1e"/></pattern>`;
  const piping = (w, h) => `<rect x="0" y="0" width="15" height="${h}" fill="url(#stripes)"/><rect x="${w - 15}" y="0" width="15" height="${h}" fill="url(#stripes)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${A}"><defs>${weave('w')}${stripes}
</defs>
    <rect width="${A}" height="${A}" fill="#f7f6f2"/>
    ${boxFaces(W, H, D, {
      front: () => `${arcText("WELCOME", 130, 163, 64, 20.5, red)}
        <path d="M 109 124 A 21 18 0 0 1 151 124 Z" fill="#f1dcae" stroke="${red}" stroke-width="1.6"/>
        <path d="M 121 116 q 3 -4 6 0 M 133 116 q 3 -4 6 0 M 124 120 q 6 4 12 0" fill="none" stroke="${red}" stroke-width="1.2" stroke-linecap="round"/>
        <text x="130" y="145" text-anchor="middle" ${font} font-size="16.5" fill="${red}">TO THE</text>
        <text x="130" y="167" text-anchor="middle" ${font} font-size="19.5" fill="${red}">SUNNY SIDE</text>`,
      right: piping,
      left: piping,
      top: (w, h) => `<rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="16" fill="none" stroke="#3a3a3a" stroke-width="3.4"/>
        <rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="16" fill="none" stroke="#7a7a7a" stroke-width="1"/>
        <rect x="${w - 40}" y="${h - 18}" width="16" height="9" rx="2.5" fill="#2a2a2a"/>`,
      bottom: (w, h) => `<rect width="${w}" height="${h}" fill="#dedcd6"/>`,
    })}
    <rect width="${A}" height="${A}" filter="url(#w)"/></svg>`;
  const { doc, buffer, scene } = begin();
  const tex = await textureFrom(doc, 'cooler', await atlas('sunny-cooler', svg));
  const cloth = doc.createMaterial('cooler-cloth').setBaseColorTexture(tex).setRoughnessFactor(0.62).setMetallicFactor(0);
  const root = doc.createNode('sunny-cooler');
  scene.addChild(root);
  add(doc, buffer, root, 'body', roundedBox(W / 1000, H / 1000, D / 1000, 0.04, LAYOUT, { n: 20, soft: 0.42 }), cloth);
  // the loop: webbing rising off the lid from front to back, its width across
  const turq = doc.createMaterial('handle').setBaseColorFactor(lin('#1aa6d6')).setRoughnessFactor(0.6).setMetallicFactor(0).setDoubleSided(true);
  const y0 = H / 2000 + 0.004;
  const loop = [];
  for (let k = 0; k <= 28; k++) {
    const a = Math.PI * (k / 28);
    loop.push([0, y0 - 0.004 + Math.sin(a) * 0.085, 0.05 * Math.cos(a)]);
  }
  add(doc, buffer, root, 'handle', strap(loop, 0.042, (q) => v3.norm([0, q[1] - y0, q[2] / 0.6])), turq);
  // where it is stitched down: two short flat tabs on the lid
  for (const z of [0.05, -0.05])
    add(doc, buffer, root, 'handle', strap([[0, y0, z - 0.018], [0, y0, z], [0, y0, z + 0.018]], 0.042, [0, 1, 0]), turq);
  await write(doc, path.join(OUT, 'sunny-cooler.glb'));
}

async function blanket() {
  // the fleece rolled up soft, CASTELLO DI TREVI embroidered in black along it, a black leather strap round it closing
  // on a brass snap; each end shows the layers of the roll. (the side drawn in millimetres: along the roll, then round
  // it from the top towards the front; the ends below it)
  const R = 0.15, L = 0.44, SQ = 0.84, T0 = 0.9;
  const along = T0 * L * 1000, round = Math.PI * (R * (1 + SQ)) * 1000; // (the section's circumference, near enough)
  const SIDE = [0, 0, 1, 0.75];
  const CAPS = [[0, 0.75, 0.25, 1], [0.25, 0.75, 0.5, 1]];
  // the layers: a spiral from the core out to the edge (each end's disc fills 0.8 of its square's half-width)
  const spiral = ([u0, v0, u1, v1], dir) => {
    const cx = ((u0 + u1) / 2) * A, cy = ((v0 + v1) / 2) * A, rr = ((u1 - u0) / 2) * A * 0.8;
    const pts = [];
    for (let k = 0; k <= 400; k++) {
      const t = k / 400;
      const a = dir * t * Math.PI * 2 * 4.2;
      const r = rr * (0.1 + 0.9 * t);
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r * 1.0).toFixed(1)}`);
    }
    return `<polyline points="${pts.join(' ')}" fill="none" stroke="#b9bec5" stroke-width="5" stroke-linecap="round" filter="url(#soft)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#fdfdfd" stroke-width="2.5" stroke-linecap="round" transform="translate(1.5 -1.5)" opacity="0.8"/>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${A}" height="${A}"><defs>
      <filter id="pile"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" seed="9"/><feColorMatrix values="0 0 0 0 0.70  0 0 0 0 0.72  0 0 0 0 0.76  0 0 0 0.34 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <filter id="soft"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="stitch"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></defs>
    <rect width="${A}" height="${A}" fill="#eef0f1"/>
    ${spiral(CAPS[0], 1)}${spiral(CAPS[1], -1)}
    <rect width="${A}" height="${A}" filter="url(#pile)"/>
    <g transform="scale(${(SIDE[2] * A) / along} ${((SIDE[3] - SIDE[1]) * A) / round})">
      <text x="${along / 2 + 4}" y="${round * 0.2 + 11}" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-weight="700" font-size="28" letter-spacing="1.2" fill="#141414" filter="url(#stitch)">CASTELLO DI TREVI</text>
    </g></svg>`;
  const { doc, buffer, scene } = begin();
  const tex = await textureFrom(doc, 'fleece', await atlas('trevi-blanket', svg));
  const fleece = doc.createMaterial('fleece').setBaseColorTexture(tex).setRoughnessFactor(1).setMetallicFactor(0);
  const root = doc.createNode('trevi-blanket');
  scene.addChild(root);
  add(doc, buffer, root, 'body', roll(R, L, { squash: SQ, t0: T0, sideRect: SIDE, capRects: CAPS }), fleece);
  // the strap round it (its width along the roll), its end lapping over itself where the snap closes
  const leather = doc.createMaterial('leather').setBaseColorFactor(lin('#121212')).setRoughnessFactor(0.42).setMetallicFactor(0).setDoubleSided(true);
  const xs = -0.035;
  const ring = (a0, a1, out, n) => Array.from({ length: n + 1 }, (_, k) => rollPoint(R, L, xs, a0 + ((a1 - a0) * k) / n, { squash: SQ, out }));
  const radial = (q) => v3.norm([0, q[1] / (SQ * SQ), q[2]]);
  add(doc, buffer, root, 'strap', strap(ring(0, Math.PI * 2, 0.004, 72), 0.04, radial), leather);
  add(doc, buffer, root, 'strap', strap(ring(0.85, 1.55, 0.008, 12), 0.04, radial), leather);
  const brass = doc.createMaterial('snap').setBaseColorFactor(lin('#b8893a')).setRoughnessFactor(0.28).setMetallicFactor(1);
  const at = 1.32;
  const c = rollPoint(R, L, xs, at, { squash: SQ, out: 0.0125 });
  add(doc, buffer, root, 'snap', roundedBox(0.017, 0.017, 0.006, 0.0082, plain, { n: 6 }), brass)
    .setTranslation(c)
    .setRotation(facing(radial(c)));
  await write(doc, path.join(OUT, 'trevi-blanket.glb'));
}

void v3;
void stripGeometry;
const all = { 'star-waistbag': waistbag, 'star-duffle': duffle, 'sunny-cooler': cooler, 'trevi-blanket': blanket };
const ids = process.argv.slice(2).filter((a) => a in all);
for (const id of ids.length ? ids : Object.keys(all)) await all[id]();
