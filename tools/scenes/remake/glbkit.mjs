// Shared pieces for the GLBs the studio's scenes and showroom are built from (hero_v5.mjs, products.mjs): small vector
// and quaternion helpers, KTX2 textures, meshes and animation channels for glTF Transform, and the geometry of a few
// real things (the atelier's sewn T-shirt, a box on an atlas, a paper bag, a rope handle, a glow).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { encodeKTX2 } from '../ktx.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
await MeshoptEncoder.ready;

export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};
export const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 1, 2].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => {
  const c1 = 1.3;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
// quaternions [x, y, z, w]
export const qAxis = (axis, a) => {
  const n = v3.norm(axis);
  const s = Math.sin(a / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(a / 2)];
};
export const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
/** the rotation whose z axis looks along dir and whose y axis is as close to up as it can be, then rolled */
export const qLook = (dir, roll = 0) => {
  const z = v3.norm(dir);
  let x = v3.norm(v3.cross([0, 1, 0], z));
  if (!Number.isFinite(x[0])) x = [1, 0, 0];
  const y = v3.cross(z, x);
  const m = [x, y, z];
  const tr = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s];
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = [0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s];
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = [(m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s];
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = [(m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s];
  }
  return roll ? qMul(q, qAxis([0, 0, 1], roll)) : q;
};
export const qSlerp = (a, b, t) => {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = b.map((x) => -x);
  }
  if (d > 0.9995) return v3.norm4(a.map((x, i) => x + (bb[i] - x) * t));
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return a.map((x, i) => x * wa + bb[i] * wb);
};
v3.norm4 = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((x) => x / l);
};

export async function ktx(rgba, width, height, opts = {}) {
  return encodeKTX2(rgba, { width, height, mipmaps: true, quality: 200, ...opts });
}
export async function textureFrom(doc, name, file, size) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await (size ? img.resize(size[0], size[1], { fit: 'fill' }) : img).raw().toBuffer({ resolveWithObject: true });
  const w = Math.floor(info.width / 4) * 4;
  const h = Math.floor(info.height / 4) * 4;
  let px = data;
  if (w !== info.width || h !== info.height) px = (await sharp(data, { raw: info }).extract({ left: 0, top: 0, width: w, height: h }).raw().toBuffer());
  return doc.createTexture(name).setImage(await ktx(px, w, h)).setMimeType('image/ktx2');
}
export function meshOf(doc, buffer, name, positions, uvs, indices, normals, material) {
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)).setBuffer(buffer))
    .setMaterial(material);
  if (normals) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer));
  return doc.createMesh(name).addPrimitive(prim);
}
/** an animation channel from sampled keys */
export function channel(doc, buffer, anim, node, pathName, times, values, type) {
  const s = doc
    .createAnimationSampler()
    .setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer))
    .setOutput(doc.createAccessor().setType(type).setArray(new Float32Array(values.flat())).setBuffer(buffer))
    .setInterpolation('LINEAR');
  anim.addSampler(s);
  anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(s));
}
export async function write(doc, file) {
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await doc.transform(reorder({ encoder: MeshoptEncoder }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await io.write(file, doc);
  console.log(`  ${path.relative(ROOT, file)}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}


// ------------------------------------------------------------------------------------------------- things
/** a rope handle: a tube along a raised arc from one eyelet to the other */
export function ropeGeometry(a, b, height, r = 0.006, segs = 24, sides = 8) {
  const pos = [], nor = [], uv = [], idx = [];
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = v3.lerp(a, b, t);
    p[1] += Math.sin(t * Math.PI) * height;
    pts.push(p);
  }
  for (let i = 0; i <= segs; i++) {
    const p = pts[i];
    const tg = v3.norm(v3.sub(pts[Math.min(segs, i + 1)], pts[Math.max(0, i - 1)]));
    let nx = v3.norm(v3.cross(tg, [0, 0, 1]));
    if (!Number.isFinite(nx[0])) nx = [1, 0, 0];
    const ny = v3.cross(tg, nx);
    for (let j = 0; j <= sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      const d = v3.add(v3.mul(nx, Math.cos(th)), v3.mul(ny, Math.sin(th)));
      pos.push(...v3.add(p, v3.mul(d, r)));
      nor.push(...d);
      uv.push(j / sides, i / segs);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < sides; j++) {
      const k = i * (sides + 1) + j;
      idx.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
    }
  return { pos, nor, uv, tri: idx };
}

/** a paper bag w x h x d, its top open: front and back, two gusseted sides, the base (a box without its lid) */
export function bagBodyGeometry(w, h, d) {
  const [x, z] = [w / 2, d / 2];
  const pos = [], uv = [], nor = [], tri = [];
  const quad = (c, n, uvr) => {
    const k = pos.length / 3;
    const [u0, v0, u1, v1] = uvr;
    const uvs = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    c.forEach((p, i) => {
      pos.push(...p);
      nor.push(...n);
      uv.push(...uvs[i]);
    });
    tri.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  // uv: the front picture over [0, 0.72] x [0, 1]; the plain red elsewhere (a corner of the front picture)
  const plain = [0.01, 0.02, 0.06, 0.08];
  quad([[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]], [0, 0, 1], [0, 0, 1, 1]);
  quad([[x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]], [0, 0, -1], plain);
  quad([[x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]], [1, 0, 0], plain);
  quad([[-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]], [-1, 0, 0], plain);
  quad([[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]], [0, -1, 0], plain);
  return { pos, uv, nor, tri };
}

export function teeGeometry() {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/tee/tee-hi.json'), 'utf8'));
  const bin = fs.readFileSync(path.join(ROOT, 'public/tee/tee-hi.bin'));
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const C = { Float32Array, Uint32Array, Uint8Array, Uint16Array, Int32Array };
  const d = {};
  for (const [k, l] of Object.entries(meta.layout)) d[k] = new C[l.type](ab, l.offset, l.length);
  const n = meta.renderCount;
  const pos = new Float32Array(n * 3);
  // centred on its middle (it turns about it)
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < meta.physCount; i++) {
    cx += d.position[i * 3];
    cy += d.position[i * 3 + 1];
    cz += d.position[i * 3 + 2];
  }
  cx /= meta.physCount;
  cy /= meta.physCount;
  cz /= meta.physCount;
  for (let i = 0; i < n; i++) {
    const k = d.renderMap[i] * 3;
    pos[i * 3] = d.position[k] - cx;
    pos[i * 3 + 1] = d.position[k + 1] - cy;
    pos[i * 3 + 2] = d.position[k + 2] - cz;
  }
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = d.renderUv[i * 2];
    uv[i * 2 + 1] = 1 - d.renderUv[i * 2 + 1]; // glTF's v runs down the picture
  }
  const tri = Array.from(d.renderTriangles);
  // smooth normals
  const nor = new Float32Array(n * 3);
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t] * 3, tri[t + 1] * 3, tri[t + 2] * 3];
    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const v = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const nn = v3.cross(u, v);
    for (const k of [a, b, c]) {
      nor[k] += nn[0];
      nor[k + 1] += nn[1];
      nor[k + 2] += nn[2];
    }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
    nor[i * 3] /= l;
    nor[i * 3 + 1] /= l;
    nor[i * 3 + 2] /= l;
  }
  return { pos: Array.from(pos), uv: Array.from(uv), tri, nor: Array.from(nor) };
}

/** a box w x h x d (metres) on the Rivoli atlas (rivoli_box.py): the envelope face front and back, ends, lid, base */
export function boxGeometry(w, h, d) {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const A = 1024;
  const r = (u0, v0, u1, v1) => [u0 / A, v0 / A, u1 / A, v1 / A];
  const faces = [
    // normal, corners (counter-clockwise seen from outside), uv rect
    { c: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], uv: r(0, 528, 1024, 0), n: [0, 0, 1] }, // front
    { c: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]], uv: r(0, 528, 1024, 0), n: [0, 0, -1] }, // back
    { c: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]], uv: r(0, 800, 512, 528), n: [1, 0, 0] }, // right end
    { c: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], uv: r(0, 800, 512, 528), n: [-1, 0, 0] }, // left end
    { c: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]], uv: r(512, 872, 1024, 528), n: [0, 1, 0] }, // lid
    { c: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], uv: r(512, 872, 1024, 528), n: [0, -1, 0] }, // base
  ];
  const pos = [], uv = [], nor = [], idx = [];
  for (const f of faces) {
    const base = pos.length / 3;
    const [u0, v0, u1, v1] = f.uv;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    f.c.forEach((p, k) => {
      pos.push(...p);
      uv.push(...uvs[k]);
      nor.push(...f.n);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { pos, uv, nor, tri: idx };
}

/** a glow: a white-hot core, a warm halo and (rays > 0) a few long rays, as a flash bulb seen from in front */
export function glowPixels(N, rays = 1) {
  const px = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5;
      const dy = (y + 0.5) / N - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = Math.atan2(dy, dx);
      const core = Math.exp(-r * r * 60);
      const halo = Math.exp(-r * r * 7) * 0.65;
      const ray = (Math.pow(Math.abs(Math.cos(a * 4)), 60) * Math.exp(-r * 3.2) * 0.55 + Math.pow(Math.abs(Math.cos(a * 4 + 0.39)), 90) * Math.exp(-r * 4) * 0.3) * rays;
      const v = Math.min(1, core + halo + ray) * Math.max(0, 1 - r);
      const k = (y * N + x) * 4;
      px[k] = Math.round(255 * Math.min(1, v));
      px[k + 1] = Math.round(255 * Math.min(1, v * 0.97));
      px[k + 2] = Math.round(255 * Math.min(1, v * 0.9));
      px[k + 3] = Math.round(255 * v);
    }
  }
  return px;
}

