// The hero's moving pieces (hero_v5.py makes the figures and the backdrop): what the studio's bag spills when the
// photographer's flash goes off, and the flash itself. Writes, in art/scenes/hero-v5/:
//
//   spill.glb   seven of the studio's pictures (a panorama that unfolds out of the bag along an arc), one of its
//               T-shirts (the atelier's sewn shirt, in the blue of its own tees, with its woven neck label) and one
//               of its boxes (the Rivoli box, as photographed), with two clips:
//                 spill  (driven by the timeline, 0..1)  everything leaves the bag and takes its place
//                 float  (a loop)                        each piece then drifts a little, as things do in no air
//   flash.glb   the flash: a glow at the camera's reflector, with the clip flash (0..1: out, bright, gone)
//
// Where the bag's mouth and the camera's reflector are in the scene comes from hero_v5.py (anchors.json).
//
//   node tools/scenes/remake/hero_v5.mjs
import fs from 'node:fs';
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import sharp from 'sharp';
import {
  ROOT, v3, bezier, clamp01, easeOutCubic, easeOutBack, qAxis, qMul, qLook, qSlerp, ktx, textureFrom, meshOf, channel,
  write, ropeGeometry, bagBodyGeometry, teeGeometry, boxGeometry, glowPixels,
} from './glbkit.mjs';

const WORK = 'D:/RAhpel/.work-raphael/v5-art/hero';
const OUT = path.join(ROOT, 'art/scenes/hero-v5');
const MEDIA = path.join(ROOT, 'src/assets/media');
// the studio's work in the panorama (its own pictures; nothing a stricter market would hide: see content/policy.ts)
const PICTURES = ['packaging-stack', 'total-polos', 'gem', 'trevi-box', 'dosh-pos', 'oxi-blazer', 'mpg-barista'];
const anchors = JSON.parse(fs.readFileSync(path.join(WORK, 'anchors.json'), 'utf8'));

// ------------------------------------------------------------------------------------------------- the pictures
/** the seven pictures as prints (a white border), in one atlas, 3 x 3 cells of 680 x 452 */
async function panelsAtlas() {
  const cw = 680;
  const ch = 452;
  const b = 16;
  const comps = [];
  for (const [i, id] of PICTURES.entries()) {
    const file = path.join(MEDIA, `${id}.jpg`);
    const pic = await sharp(file).resize(cw - 2 * b, ch - 2 * b, { fit: 'cover', position: 'attention' }).toBuffer();
    comps.push({ input: { create: { width: cw, height: ch, channels: 4, background: '#f6f3ec' } }, left: (i % 3) * cw, top: Math.floor(i / 3) * ch });
    comps.push({ input: pic, left: (i % 3) * cw + b, top: Math.floor(i / 3) * ch + b });
  }
  const file = path.join(WORK, 'panels-atlas.png');
  await sharp({ create: { width: 2040, height: 1356, channels: 4, background: '#00000000' } }).composite(comps).png().toFile(file);
  return { file, cw, ch, W: 2040, H: 1356 };
}

// ------------------------------------------------------------------------------------------------- the bag
// The studio's own bag (media/raphael-bag.png): red paper, RAPHAEL STUDIOS across the top, and a pair of doors on its
// front that open onto a shop. Here the doors really open, and the work comes out through them.
const BAG_PHOTO = path.join(MEDIA, 'raphael-bag.png');
async function bagPictures() {
  const photo = sharp(BAG_PHOTO).removeAlpha();
  const { data, info } = await photo.clone().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const k = (y * info.width + x) * 3;
    return [data[k], data[k + 1], data[k + 2]];
  };
  // the paper's red, from its plain upper corner
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = 318; y < 360; y++)
    for (let x = 222; x < 280; x++) {
      const c = at(x, y);
      r += c[0];
      g += c[1];
      bl += c[2];
      n++;
    }
  const red = [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  // the front: 736 x 1000 (the photo's front, 470 x 640, scaled); its words where they are on the bag; a dark door
  // frame where the doors are
  const FW = 736;
  const FH = 1000;
  const sx = FW / 470;
  const sy = FH / 640;
  // (the letters only: lifted off the photograph by their whiteness, so no patch of its paper comes with them)
  const crop = photo.clone().extract({ left: 282, top: 370, width: 348, height: 146 }).resize(Math.round(348 * sx), Math.round(146 * sy));
  const ink = await crop.clone().greyscale().linear(255 / 70, (-150 * 255) / 70).raw().toBuffer({ resolveWithObject: true });
  const words = await sharp({ create: { width: ink.info.width, height: ink.info.height, channels: 3, background: { r: 250, g: 246, b: 240 } } })
    .joinChannel(ink.data, { raw: { width: ink.info.width, height: ink.info.height, channels: 1 } })
    .png()
    .toBuffer();
  const frame = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}">
      <defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.18"/><stop offset="0.12" stop-color="#000" stop-opacity="0"/><stop offset="0.88" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient></defs>
      <rect width="${FW}" height="${FH}" fill="url(#s)"/>
      <rect x="${Math.round((345 - 210) * sx) - 10}" y="${Math.round((528 - 290) * sy) - 10}" width="${Math.round(245 * sx) + 20}" height="${Math.round(375 * sy) + 14}" fill="none" stroke="#2a0805" stroke-width="10"/>
      <rect x="${Math.round((345 - 210) * sx)}" y="${Math.round((528 - 290) * sy)}" width="${Math.round(245 * sx)}" height="${Math.round(375 * sy)}" fill="#1a0604"/>
    </svg>`,
  );
  const front = await sharp({ create: { width: FW, height: FH, channels: 3, background: { r: red[0], g: red[1], b: red[2] } } })
    .composite([
      { input: frame, left: 0, top: 0 },
      { input: words, left: Math.round((282 - 210) * sx), top: Math.round((370 - 290) * sy) },
    ])
    .png()
    .toFile(path.join(WORK, 'bag-front.png'));
  void front;
  // a door: the photo's right door (as it stands open, nearly square-on), 196 x 600
  await photo.clone().extract({ left: 592, top: 545, width: 90, height: 380 }).resize(196, 600, { fit: 'fill' }).png().toFile(path.join(WORK, 'bag-door.png'));
  // the shop inside, seen through the doorway
  await photo.clone().extract({ left: 352, top: 534, width: 232, height: 368 }).resize(384, 608, { fit: 'fill' }).png().toFile(path.join(WORK, 'bag-shop.png'));
  return { red, doorway: { x0: (345 - 210) / 470, y0: (528 - 290) / 640, x1: (590 - 210) / 470, y1: (903 - 290) / 640 } };
}

// ------------------------------------------------------------------------------------------------- spill.glb
async function spill() {
  const doc = new Document();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const S = anchors.scale ?? 1; // the scene's metres per real metre (the statues are larger than life)

  // ---- the bag, hanging from the model's hand by its rope handles, its front to the camera
  const pics = await bagPictures();
  const BS = anchors.bagScale ?? S;
  const [bw, bh, bd] = [0.34 * BS, 0.44 * BS, 0.13 * BS];
  const ropeH = 0.15 * BS;
  const H = anchors.hand; // where the hand holds the handles
  const bagPos = [H[0], H[1] - ropeH - bh, H[2]]; // the bag's base, centre
  const bag = doc.createNode('bag').setTranslation(bagPos).setRotation(qAxis([0, 1, 0], anchors.bagYaw ?? 0));
  scene.addChild(bag);
  const bagSwing = doc.createNode('bag-swing').setTranslation([0, bh + ropeH, 0]); // swings about the hand (float)
  bag.addChild(bagSwing);
  const bagSway = doc.createNode('bag-sway'); // the kick when its doors fly open (spill)
  bagSwing.addChild(bagSway);
  const bagBody = doc.createNode('bag-body').setTranslation([0, -(bh + ropeH), 0]);
  bagSway.addChild(bagBody);
  const red = pics.red.map((c) => c / 255);
  const frontTex = await textureFrom(doc, 'bag-front', path.join(WORK, 'bag-front.png'));
  const paper = doc.createMaterial('bag-paper').setBaseColorTexture(frontTex).setRoughnessFactor(0.78).setMetallicFactor(0).setDoubleSided(true);
  const plainPaper = doc.createMaterial('bag-plain').setBaseColorFactor([...red.map((c) => Math.pow(c, 2.2)), 1]).setRoughnessFactor(0.8).setMetallicFactor(0).setDoubleSided(true);
  // the front with the doorway cut out of it (four bands round it), the other faces whole
  const dw = pics.doorway;
  const [x0, x1] = [-bw / 2 + dw.x0 * bw, -bw / 2 + dw.x1 * bw];
  const [y0, y1] = [bh * (1 - dw.y1), bh * (1 - dw.y0)];
  const fz = bd / 2;
  const fpos = [], fuv = [], ftri = [], fnor = [];
  const band = (ax, ay, bx, by) => {
    const k = fpos.length / 3;
    const U = (x) => (x + bw / 2) / bw;
    const Vv = (y) => 1 - y / bh;
    [[ax, ay], [bx, ay], [bx, by], [ax, by]].forEach(([x, y]) => {
      fpos.push(x, y, fz);
      fuv.push(U(x), Vv(y));
      fnor.push(0, 0, 1);
    });
    ftri.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  band(-bw / 2, y1, bw / 2, bh);
  band(-bw / 2, 0, bw / 2, y0);
  band(-bw / 2, y0, x0, y1);
  band(x1, y0, bw / 2, y1);
  bagBody.setMesh(meshOf(doc, buffer, 'bag-front', fpos, fuv, ftri, fnor, paper));
  const rest = bagBodyGeometry(bw, bh, bd);
  // (the body's own front quad gives way to the banded front: its first face is dropped)
  const restPos = rest.pos.slice(12), restUv = rest.uv.slice(8), restNor = rest.nor.slice(12), restTri = rest.tri.slice(6).map((i) => i - 4);
  bagBody.addChild(doc.createNode('bag-shell').setMesh(meshOf(doc, buffer, 'bag-shell', restPos, restUv, restTri, restNor, plainPaper)));
  // inside: the shop, lit, seen through the doorway (set back from the front)
  const shopMat = doc.createMaterial('paint-shop').setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]).setEmissiveTexture(await textureFrom(doc, 'shop', path.join(WORK, 'bag-shop.png'))).setDoubleSided(true);
  const sz = fz - bd * 0.55;
  bagBody.addChild(doc.createNode('bag-shop').setMesh(meshOf(doc, buffer, 'shop', [x0, y0, sz, x1, y0, sz, x1, y1, sz, x0, y1, sz], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], null, shopMat)));
  // the doorway's sides (dark), so the shop sits in a box
  const dark = doc.createMaterial('bag-dark').setBaseColorFactor([0.03, 0.01, 0.01, 1]).setRoughnessFactor(1).setDoubleSided(true);
  const jamb = (ax, ay, bx, by) => [ax, ay, fz, bx, by, fz, bx, by, sz, ax, ay, sz];
  bagBody.addChild(
    doc.createNode('bag-jambs').setMesh(
      meshOf(
        doc,
        buffer,
        'jambs',
        [...jamb(x0, y0, x0, y1), ...jamb(x1, y1, x1, y0), ...jamb(x0, y1, x1, y1), ...jamb(x1, y0, x0, y0)],
        Array(32).fill(0),
        [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15],
        null,
        dark,
      ),
    ),
  );
  // the two doors, hinged on the doorway's sides
  const doorTex = await textureFrom(doc, 'door', path.join(WORK, 'bag-door.png'));
  const doorMat = doc.createMaterial('bag-door').setBaseColorTexture(doorTex).setRoughnessFactor(0.7).setMetallicFactor(0).setDoubleSided(true);
  const hw = (x1 - x0) / 2;
  const doorL = doc.createNode('door-l').setTranslation([x0, 0, fz + 0.002]);
  doorL.setMesh(meshOf(doc, buffer, 'door-l', [0, y0, 0, hw, y0, 0, hw, y1, 0, 0, y1, 0], [1, 1, 0, 1, 0, 0, 1, 0], [0, 1, 2, 0, 2, 3], null, doorMat));
  const doorR = doc.createNode('door-r').setTranslation([x1, 0, fz + 0.002]);
  doorR.setMesh(meshOf(doc, buffer, 'door-r', [-hw, y0, 0, 0, y0, 0, 0, y1, 0, -hw, y1, 0], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], null, doorMat));
  bagBody.addChild(doorL).addChild(doorR);
  // the light that comes out when they open
  const doorGlowTex = doc.createTexture('door-glow').setImage(await ktx(glowPixels(256, 0), 256, 256)).setMimeType('image/ktx2');
  const doorGlowMat = doc.createMaterial('glow-door').setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 0.86, 0.62]).setEmissiveTexture(doorGlowTex).setAlphaMode('BLEND').setDoubleSided(true);
  const gs = (x1 - x0) * 1.9;
  const doorGlow = doc.createNode('door-glow').setTranslation([(x0 + x1) / 2, (y0 + y1) / 2, fz + 0.02]).setScale([0.001, 0.001, 0.001]).setMesh(meshOf(doc, buffer, 'door-glow', [-gs, -gs, 0, gs, -gs, 0, gs, gs, 0, -gs, gs, 0], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], null, doorGlowMat));
  bagBody.addChild(doorGlow);
  // the rope handles: front and back, from eyelets under the top edge up to the hand
  const ropeMat = doc.createMaterial('bag-rope').setBaseColorFactor([0.62, 0.55, 0.42, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
  for (const z of [fz - 0.004, -fz + 0.004]) {
    const r = ropeGeometry([-bw * 0.16, bh - 0.02 * BS, z], [bw * 0.16, bh - 0.02 * BS, z], ropeH + 0.02 * BS, 0.0045 * BS);
    bagBody.addChild(doc.createNode('rope').setMesh(meshOf(doc, buffer, 'rope', r.pos, r.uv, r.tri, r.nor, ropeMat)));
  }
  // the doorway's centre in the scene (the work comes out there): the bag's own frame, turned and placed
  const yaw = anchors.bagYaw ?? 0;
  const local = [(x0 + x1) / 2, (y0 + y1) / 2, fz + 0.04 * S];
  const B = [bagPos[0] + local[0] * Math.cos(yaw) + local[2] * Math.sin(yaw), bagPos[1] + local[1], bagPos[2] - local[0] * Math.sin(yaw) + local[2] * Math.cos(yaw)];
  const arc = [B, ...anchors.arc.slice(1)];

  // the pictures: an arc that leaves the bag, rises and sweeps across over the scene, nearer the camera as it goes
  const atlas = await panelsAtlas();
  const pmat = doc
    .createMaterial('paint-work')
    .setBaseColorFactor([0, 0, 0, 1])
    .setEmissiveFactor([1, 1, 1])
    .setEmissiveTexture(await textureFrom(doc, 'work', atlas.file))
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.2)
    .setDoubleSided(true);
  const panelW = anchors.panel ?? 0.78;
  const panelH = panelW * (atlas.ch / atlas.cw);
  const panels = [];
  const N = PICTURES.length;
  for (let i = 0; i < N; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const u0 = (col * atlas.cw) / atlas.W;
    const u1 = ((col + 1) * atlas.cw) / atlas.W;
    const v0 = (row * atlas.ch) / atlas.H;
    const v1 = ((row + 1) * atlas.ch) / atlas.H;
    const hw = panelW / 2;
    const hh = panelH / 2;
    const mesh = meshOf(doc, buffer, `work-${i}`, [-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0], [u0, v1, u1, v1, u1, v0, u0, v0], [0, 1, 2, 0, 2, 3], null, pmat);
    const node = doc.createNode(`work-${i}`);
    const inner = doc.createNode(`work-${i}-float`).setMesh(mesh);
    node.addChild(inner);
    scene.addChild(node);
    panels.push({ node, inner, t: 0.32 + (0.68 * i) / (N - 1) });
  }

  // the shirt and the box
  const tee = teeGeometry();
  const teeTex = await textureFrom(doc, 'tee', path.join(WORK, 'tee-atlas.png'));
  const teeMat = doc.createMaterial('tee').setBaseColorTexture(teeTex).setRoughnessFactor(0.92).setMetallicFactor(0).setDoubleSided(true);
  const teeScale = anchors.teeScale ?? S;
  const teeNode = doc.createNode('tee');
  const teeInner = doc.createNode('tee-float').setMesh(meshOf(doc, buffer, 'tee', tee.pos, tee.uv, tee.tri, tee.nor, teeMat)).setScale([teeScale, teeScale, teeScale]);
  teeNode.addChild(teeInner);
  scene.addChild(teeNode);
  const box = boxGeometry(0.3, 0.155, 0.2);
  const boxMat = doc.createMaterial('rivoli').setBaseColorTexture(await textureFrom(doc, 'rivoli', path.join(WORK, 'rivoli-atlas.png'))).setRoughnessFactor(0.55).setMetallicFactor(0);
  const boxScale = anchors.boxScale ?? S;
  const boxNode = doc.createNode('box');
  const boxInner = doc.createNode('box-float').setMesh(meshOf(doc, buffer, 'box', box.pos, box.uv, box.tri, box.nor, boxMat)).setScale([boxScale, boxScale, boxScale]);
  boxNode.addChild(boxInner);
  scene.addChild(boxNode);

  // ---- spill: 0..1 (the timeline drives it); sampled every 1/60
  const anim = doc.createAnimation('spill');
  const K = 61;
  const times = Array.from({ length: K }, (_, k) => k / (K - 1));
  const cam = [0, 0, 0];
  // the doors fly open (out towards the camera), the shop's light comes out, the bag kicks on its handles
  {
    const open = (node, dir) => {
      const R = times.map((t) => qAxis([0, 1, 0], dir * 1.85 * easeOutBack(clamp01(t / 0.12))));
      channel(doc, buffer, anim, node, 'rotation', times, R, 'VEC4');
    };
    open(doorL, -1);
    open(doorR, 1);
    const G = times.map((t) => {
      const k = clamp01((t - 0.03) / 0.14);
      const s = k <= 0 ? 0.001 : easeOutCubic(k) * (1 - 0.3 * clamp01((t - 0.3) / 0.5));
      return [s, s, s];
    });
    channel(doc, buffer, anim, doorGlow, 'scale', times, G, 'VEC3');
    const K2 = times.map((t) => {
      const k = clamp01(t / 0.5);
      return qAxis([1, 0, 0], -0.22 * Math.sin(k * Math.PI * 3) * Math.exp(-k * 3.2));
    });
    channel(doc, buffer, anim, bagSway, 'rotation', times, K2, 'VEC4');
  }
  for (const [i, p] of panels.entries()) {
    const start = 0.12 + i * 0.07;
    const dur = 0.42;
    const T = [], R = [], Sc = [];
    const end = bezier(arc[0], arc[1], arc[2], arc[3], p.t);
    const ahead = bezier(arc[0], arc[1], arc[2], arc[3], Math.min(1, p.t + 0.02));
    const behind = bezier(arc[0], arc[1], arc[2], arc[3], Math.max(0, p.t - 0.02));
    // facing the camera, rolled to follow the arc on the screen
    const tang = v3.sub(ahead, behind);
    const roll = Math.atan2(tang[1], tang[0]) * 0.55;
    const qEnd = qLook(v3.sub(cam, end), Math.max(-0.5, Math.min(0.5, roll < -Math.PI / 2 ? roll + Math.PI : roll > Math.PI / 2 ? roll - Math.PI : roll)));
    const qStart = qMul(qEnd, qAxis([1, 0.3, 0], Math.PI * 1.1));
    for (const t of times) {
      const k = clamp01((t - start) / dur);
      const e = easeOutBack(k);
      const along = Math.min(1, e) * p.t;
      const at = bezier(arc[0], arc[1], arc[2], arc[3], Math.max(0, along));
      T.push(k <= 0 ? arc[0] : at);
      R.push(qSlerp(qStart, qEnd, easeOutCubic(k)));
      const s = k <= 0 ? 0.001 : 0.08 + 0.92 * Math.min(1.04, e);
      Sc.push([s, s, s]);
    }
    channel(doc, buffer, anim, p.node, 'translation', times, T, 'VEC3');
    channel(doc, buffer, anim, p.node, 'rotation', times, R, 'VEC4');
    channel(doc, buffer, anim, p.node, 'scale', times, Sc, 'VEC3');
  }
  // the shirt: tossed out of the bag, tumbling, to float below and to the left of it
  const toss = (node, start, dur, to, spin, axis, rest) => {
    const T = [], R = [], Sc = [];
    const up = v3.add(v3.lerp(B, to, 0.35), [0, 0.55 * S, 0]);
    for (const t of times) {
      const k = clamp01((t - start) / dur);
      const e = easeOutCubic(k);
      // a throw: out and up, then down to its place (a quadratic curve), slowing as it arrives
      const a = v3.lerp(B, up, e);
      const b = v3.lerp(up, to, e);
      T.push(k <= 0 ? B : v3.lerp(a, b, e));
      R.push(qMul(rest, qAxis(axis, spin * (1 - e))));
      const s = k <= 0 ? 0.001 : 0.15 + 0.85 * Math.min(1, e * 1.3);
      Sc.push([s, s, s]);
    }
    channel(doc, buffer, anim, node, 'translation', times, T, 'VEC3');
    channel(doc, buffer, anim, node, 'rotation', times, R, 'VEC4');
    channel(doc, buffer, anim, node, 'scale', times, Sc, 'VEC3');
  };
  toss(teeNode, 0.2, 0.6, anchors.tee, Math.PI * 2.6, [0.3, 1, 0.4], qMul(qAxis([0, 0, 1], 0.32), qMul(qAxis([0, 1, 0], -0.25), qAxis([1, 0, 0], 0.12))));
  // (the box comes to rest with its envelope face, the Rivoli face, turned to the camera)
  toss(boxNode, 0.28, 0.58, anchors.box, Math.PI * 2.2, [1, 0.5, 0.2], qMul(qAxis([0, 1, 0], -0.38), qAxis([1, 0, 0], 0.14)));

  // ---- float: a slow loop (8 s), every piece on its own phase
  const fl = doc.createAnimation('float');
  const FT = Array.from({ length: 33 }, (_, k) => (k / 32) * 8);
  const drift = (node, phase, amp, rot) => {
    const T = [], R = [];
    for (const t of FT) {
      const w = (t / 8) * Math.PI * 2;
      T.push([Math.sin(w + phase) * amp * 0.4, Math.sin(w * 2 + phase) * amp, Math.cos(w + phase) * amp * 0.3]);
      R.push(v3.norm4(qMul(qAxis([0, 0, 1], Math.sin(w + phase * 1.7) * rot), qAxis([0, 1, 0], Math.cos(w + phase) * rot * 1.3))));
    }
    channel(doc, buffer, fl, node, 'translation', FT, T, 'VEC3');
    channel(doc, buffer, fl, node, 'rotation', FT, R, 'VEC4');
  };
  panels.forEach((p, i) => drift(p.inner, i * 0.9, 0.025 * S, 0.035));
  drift(teeInner, 2.1, 0.05 * S, 0.12);
  {
    const R = FT.map((t) => {
      const w = (t / 8) * Math.PI * 2;
      return v3.norm4(qMul(qAxis([0, 0, 1], Math.sin(w) * 0.05), qAxis([1, 0, 0], Math.sin(w * 2 + 0.6) * 0.03)));
    });
    channel(doc, buffer, fl, bagSwing, 'rotation', FT, R, 'VEC4');
  }
  drift(boxInner, 4.2, 0.05 * S, 0.1);
  await write(doc, path.join(OUT, 'spill.glb'));
}

// ------------------------------------------------------------------------------------------------- flash.glb
async function flash() {
  const doc = new Document();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const buffer = doc.createBuffer();
  const N = 512;
  const tex = doc.createTexture('glow').setImage(await ktx(glowPixels(N), N, N)).setMimeType('image/ktx2');
  const mat = doc.createMaterial('glow-flash').setBaseColorFactor([0, 0, 0, 1]).setEmissiveFactor([1, 1, 1]).setEmissiveTexture(tex).setAlphaMode('BLEND').setDoubleSided(true);
  const F = anchors.flash;
  const size = 2.2 * (anchors.scale ?? 1);
  const h = size / 2;
  const mesh = meshOf(doc, buffer, 'glow', [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0], [0, 1, 1, 1, 1, 0, 0, 0], [0, 1, 2, 0, 2, 3], null, mat);
  const node = doc.createNode('flash').setMesh(mesh).setTranslation(F).setRotation(qLook(v3.sub([0, 0, 0], F)));
  doc.createScene('Scene').addChild(node);
  const anim = doc.createAnimation('flash');
  const times = [0, 0.08, 0.22, 0.45, 1];
  const sc = [0.001, 1.25, 1.0, 0.45, 0.001];
  channel(doc, buffer, anim, node, 'scale', times, sc.map((s) => [s, s, s]), 'VEC3');
  await write(doc, path.join(OUT, 'flash.glb'));
}

await spill();
await flash();
