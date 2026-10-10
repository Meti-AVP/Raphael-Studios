// Cuts and sews the atelier's T-shirt: a real garment, from a size-M sewing pattern, draped on an invisible body by
// the same cloth solver the page runs (src/scripts/tee/cloth.ts). Writes public/tee/tee-{hi,lo}.bin + .json.
//
//   node tools/tee/build-tee.mjs
//
// 1. Pattern: front, back and two sleeves, in metres, each outline a run of named segments (hem, side, armhole,
//    shoulder, neck, sleeve cap, underarm).
// 2. Each piece is meshed: its outline resampled (seams share their point count, so both sides of a seam match),
//    a staggered grid inside, Delaunay triangles.
// 3. The pieces are wrapped around the body (the panels on an oval around the torso, the sleeves round the arms),
//    sewn (zero-length seam constraints), and let fall under gravity onto the body until they settle.
// 4. The seams are welded into one cloth: physics vertices (welded) and render vertices (one per piece corner, so
//    each piece keeps its own UVs in the print atlas).
//
// Rest lengths are the pattern's flat lengths: the drape (the folds at the armpits, the sleeves' bell, the hem's swing)
// comes from the pattern and the physics, not from a sculpt.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Cloth, constraintsFromTriangles } from '../../src/scripts/tee/cloth.ts';

const OUT = fileURLToPath(new URL('../../public/tee/', import.meta.url));

// ---------------------------------------------------------------------------------------------- the body
// A size-M "ghost mannequin": capsules (oval torso pieces squashed in x and z), y up, the wearer facing +z.
export const body = [
  { a: [0, 0.78, 0], b: [0, 1.04, 0], r: 0.142, sx: 1.15, sz: 0.74 }, // hips and waist: the shirt hangs loose here
  { a: [0, 1.04, 0], b: [0, 1.27, 0], r: 0.15, sx: 1.19, sz: 0.77 }, // chest: about 12 cm of ease in a size M
  { a: [-0.125, 1.325, -0.005], b: [0.125, 1.325, -0.005], r: 0.088, sz: 0.86 }, // across the shoulders
  { a: [0, 1.36, -0.01], b: [0, 1.56, -0.01], r: 0.058 }, // neck
  { a: [-0.175, 1.315, 0], b: [-0.395, 1.09, 0.015], r: 0.058 }, // right arm (the wearer's right: -x)
  { a: [0.175, 1.315, 0], b: [0.395, 1.09, 0.015], r: 0.058 }, // left arm
  { a: [-0.172, 1.318, 0], b: [-0.172, 1.318, 0], r: 0.076 }, // shoulder caps
  { a: [0.172, 1.318, 0], b: [0.172, 1.318, 0], r: 0.076 },
];
const HEM_Y = 0.7;

// ---------------------------------------------------------------------------------------------- the pattern (m)
const W = 0.262; // half chest at the side seam: chest 104.8 cm
const A = 0.47; // underarm height above the hem
const H = 0.72; // neck point (high point of shoulder) above the hem
const S = 0.226; // shoulder point, from the centre line
const HS = 0.682; // shoulder point height
const NW = 0.088; // half neck width
const FRONT_DROP = 0.088;
const BACK_DROP = 0.022;
// sleeve
const SB = 0.206; // half bicep: 41 cm round
const SO = 0.178; // half opening: 35.6 cm round
const SU = 0.1; // underarm seam length
const SC = 0.118; // cap height

const bez = (p0, p1, p2, p3, n = 24) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    out.push([
      m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
      m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
};
const line = (a, b) => [a, b];
const rev = (pts) => [...pts].reverse();
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);

function panel(drop) {
  // counter-clockwise from the hem's left end (the viewer's left)
  const armR = bez([W, A], [W - 0.024, A + 0.035], [S - 0.006, A + 0.115], [S, HS]);
  const neck = bez([NW, H], [NW * 0.55, H - drop * 0.95], [-NW * 0.55, H - drop * 0.95], [-NW, H]);
  return [
    { name: 'hem', pts: line([-W, 0], [W, 0]) },
    { name: 'sideR', pts: line([W, 0], [W, A]) },
    { name: 'armR', pts: armR },
    { name: 'shoulderR', pts: line([S, HS], [NW, H]) },
    { name: 'neck', pts: neck },
    { name: 'shoulderL', pts: line([-NW, H], [-S, HS]) },
    { name: 'armL', pts: rev(mirror(armR)) },
    { name: 'sideL', pts: line([-W, A], [-W, 0]) },
  ];
}

function sleeve() {
  // the cap's front half runs from the front underarm (+x) to the top; its back half from the top to -x
  const capF = bez([SB, SU], [SB - 0.06, SU + 0.008], [0.085, SU + SC], [0, SU + SC]);
  const capB = rev(mirror(capF));
  return [
    { name: 'hem', pts: line([-SO, 0], [SO, 0]) },
    { name: 'underF', pts: line([SO, 0], [SB, SU]) },
    { name: 'capF', pts: capF },
    { name: 'capB', pts: capB },
    { name: 'underB', pts: line([-SB, SU], [-SO, 0]) },
  ];
}

const pieces = {
  front: { segs: panel(FRONT_DROP), uv: [0.01, 0.01] },
  back: { segs: panel(BACK_DROP), uv: [0.51, 0.01] },
  sleeveR: { segs: sleeve(), uv: [0.03, 0.74] }, // the wearer's right sleeve (on the -x side)
  sleeveL: { segs: sleeve(), uv: [0.53, 0.74] },
};
const UV_SCALE = 0.93; // uv units per metre: every piece at the same texel density

// seams: [pieceA.seg, pieceB.seg, reversed?]
const seams = [
  ['front.sideR', 'back.sideR', false],
  ['front.sideL', 'back.sideL', false],
  ['front.shoulderR', 'back.shoulderR', false],
  ['front.shoulderL', 'back.shoulderL', false],
  // armholes: the panels' x>0 side is the wearer's left (sleeveL); the cap's front half meets the front armhole
  ['front.armR', 'sleeveL.capF', false],
  ['back.armR', 'sleeveL.capB', true],
  ['front.armL', 'sleeveR.capF', true],
  ['back.armL', 'sleeveR.capB', false],
  ['sleeveL.underF', 'sleeveL.underB', true],
  ['sleeveR.underF', 'sleeveR.underB', true],
];

// ---------------------------------------------------------------------------------------------- meshing
const polyLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
function resample(pts, n) {
  const L = polyLength(pts);
  const out = [pts[0]];
  let seg = 0;
  let acc = 0;
  for (let k = 1; k < n; k++) {
    const target = (L * k) / n;
    while (seg < pts.length - 2 && acc + Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1]) < target) {
      acc += Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1]);
      seg++;
    }
    const l = Math.hypot(pts[seg + 1][0] - pts[seg][0], pts[seg + 1][1] - pts[seg][1]) || 1;
    const t = Math.min(1, (target - acc) / l);
    out.push([pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c;
  }
  return c;
}
function edgeDistance(x, y, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const abx = bx - ax;
    const aby = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby || 1)));
    d = Math.min(d, Math.hypot(ax + abx * t - x, ay + aby * t - y));
  }
  return d;
}
function delaunay(points, shape) {
  const n = points.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const dx = maxX - minX + 1;
  const dy = maxY - minY + 1;
  const pts = [...points, [minX - dx * 2, minY - dy], [maxX + dx * 2, minY - dy], [(minX + maxX) / 2, maxY + dy * 3]];
  const circ = (a, b, c) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], [cx, cy] = pts[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return { a, b, c, x: ux, y: uy, r: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const keep = [];
    const edges = new Map();
    for (const t of tris) {
      if ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r) {
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
          const key = u < v ? u * 1e6 + v : v * 1e6 + u;
          if (edges.has(key)) edges.delete(key);
          else edges.set(key, [u, v]);
        }
      } else keep.push(t);
    }
    for (const [u, v] of edges.values()) keep.push(circ(u, v, i));
    tris = keep;
  }
  const out = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const [ax, ay] = pts[t.a], [bx, by] = pts[t.b], [cx, cy] = pts[t.c];
    if (!inside((ax + bx + cx) / 3, (ay + by + cy) / 3, shape)) continue;
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(cross) < 1e-12) continue;
    if (cross > 0) out.push(t.a, t.b, t.c);
    else out.push(t.a, t.c, t.b);
  }
  return out;
}

function meshPieces(h) {
  // point counts: a seam's two sides share one; free edges use the spacing
  const count = new Map();
  for (const [a, b] of seams) {
    const la = polyLength(seg(a).pts);
    const lb = polyLength(seg(b).pts);
    const n = Math.max(2, Math.round(Math.max(la, lb) / h));
    count.set(a, n);
    count.set(b, n);
  }
  const out = {};
  for (const [name, p] of Object.entries(pieces)) {
    const boundary = [];
    const segIndex = {}; // segment name -> vertex indices along it (in its own direction)
    for (const s of p.segs) {
      const key = `${name}.${s.name}`;
      const n = count.get(key) ?? Math.max(2, Math.round(polyLength(s.pts) / h));
      const pts = resample(s.pts, n);
      const idx = [];
      pts.forEach((pt, k) => {
        if (k === 0 && boundary.length) {
          idx.push(boundary.length - 1); // shared corner with the previous segment
          return;
        }
        boundary.push(pt);
        idx.push(boundary.length - 1);
      });
      segIndex[s.name] = idx;
    }
    // the last segment ends where the first began
    boundary.pop();
    const last = p.segs[p.segs.length - 1].name;
    segIndex[last][segIndex[last].length - 1] = 0;
    // interior: a staggered grid
    const xs = boundary.map((q) => q[0]);
    const ys = boundary.map((q) => q[1]);
    const pts = [...boundary];
    const dy = h * 0.866;
    let row = 0;
    for (let y = Math.min(...ys) + dy * 0.5; y < Math.max(...ys); y += dy, row++) {
      for (let x = Math.min(...xs) + (row % 2 ? h / 2 : 0); x < Math.max(...xs); x += h) {
        if (inside(x, y, boundary) && edgeDistance(x, y, boundary) > h * 0.62) pts.push([x, y]);
      }
    }
    const tri = delaunay(pts, boundary);
    out[name] = { pts, tri, segIndex, nBoundary: boundary.length };
  }
  return out;
}
const seg = (key) => {
  const [p, s] = key.split('.');
  return pieces[p].segs.find((q) => q.name === s);
};

// ---------------------------------------------------------------------------------------------- placing the pieces in 3D
function ellipseArcTable(a, b, steps = 2000) {
  // from the front centre (phi = 0, at +z) round to the back centre (phi = pi), arc length per angle
  const tab = [{ phi: 0, s: 0 }];
  let s = 0;
  for (let i = 1; i <= steps; i++) {
    const p0 = (Math.PI * (i - 1)) / steps;
    const p1 = (Math.PI * i) / steps;
    s += Math.hypot(a * Math.sin(p1) - a * Math.sin(p0), b * Math.cos(p1) - b * Math.cos(p0));
    tab.push({ phi: p1, s });
  }
  return tab;
}
function phiAt(tab, s) {
  let lo = 0, hi = tab.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (tab[m].s < s) lo = m;
    else hi = m;
  }
  const t = (s - tab[lo].s) / (tab[hi].s - tab[lo].s || 1);
  return tab[lo].phi + (tab[hi].phi - tab[lo].phi) * t;
}
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function place(name, x, y) {
  if (name === 'front' || name === 'back') {
    const a = 0.215;
    const b = 0.155;
    const tab = ellipseArcTable(a, b);
    // the panel's centre line on the body's centre line; its width wraps half way round
    const s = Math.abs(x);
    const phi = phiAt(tab, s) * Math.sign(x);
    let px = a * Math.sin(phi);
    let pz = b * Math.cos(phi);
    if (name === 'back') pz = -pz;
    // above the underarm the panel leans in towards the shoulders
    const lean = smooth(A - 0.02, H, y);
    pz *= 1 - lean * 0.62;
    px *= 1 - lean * 0.12;
    return [px, HEM_Y + y, pz];
  }
  // sleeves: round the arm, cap at the shoulder
  const side = name === 'sleeveL' ? 1 : -1;
  const J = [0.19 * side, 1.335, 0];
  const d = [0.7 * side, -0.714, 0];
  const up = [0.714 * side, 0.7, 0];
  const front = [0, 0, 1];
  const r = 0.072;
  const theta = x / r; // x > 0: the front half
  const t = SU + SC - y + 0.01; // the cap's top at the shoulder joint
  return [
    J[0] + d[0] * t + r * (Math.cos(theta) * up[0] + Math.sin(theta) * front[0]),
    J[1] + d[1] * t + r * (Math.cos(theta) * up[1] + Math.sin(theta) * front[1]),
    J[2] + d[2] * t + r * (Math.cos(theta) * up[2] + Math.sin(theta) * front[2]),
  ];
}

// ---------------------------------------------------------------------------------------------- build
function build(h, label) {
  const meshed = meshPieces(h);
  // one array for every piece's vertices (render vertices); the physics will weld seams later
  const pos = [];
  const uv = [];
  const flat = [];
  const piece = [];
  const tri = [];
  const base = {};
  let pi = 0;
  for (const [name, m] of Object.entries(meshed)) {
    base[name] = pos.length / 3;
    const [u0, v0] = pieces[name].uv;
    const minX = Math.min(...m.pts.map((q) => q[0]));
    const minY = Math.min(...m.pts.map((q) => q[1]));
    for (const [x, y] of m.pts) {
      pos.push(...place(name, x, y));
      flat.push(x, y);
      uv.push(u0 + (x - minX) * UV_SCALE, v0 + (y - minY) * UV_SCALE);
      piece.push(pi);
    }
    for (const i of m.tri) tri.push(base[name] + i);
    pi++;
  }
  const nr = pos.length / 3;
  // seam pairs (render vertex indices)
  const pairs = [];
  for (const [a, b, reversed] of seams) {
    const [pa, sa] = a.split('.');
    const [pb, sb] = b.split('.');
    const ia = meshed[pa].segIndex[sa].map((i) => base[pa] + i);
    let ib = meshed[pb].segIndex[sb].map((i) => base[pb] + i);
    if (reversed) ib = [...ib].reverse();
    if (ia.length !== ib.length) throw new Error(`seam ${a}-${b}: ${ia.length} vs ${ib.length} points`);
    for (let k = 0; k < ia.length; k++) pairs.push(ia[k], ib[k]);
  }

  // rest lengths from the flat pattern (per piece, so all from the 2D coordinates)
  const P = new Float32Array(pos);
  const T = new Uint32Array(tri);
  const flat2 = new Float32Array(flat);
  const c = constraintsFromTriangles(P, T, flat2);
  const cloth = new Cloth(
    { pos: P, tri: T, stretch: c.stretch, stretchRest: c.stretchRest, bend: c.bend, bendRest: c.bendRest },
    { gravity: 0, damping: 2.0, drag: 2.5, stretchCompliance: 1e-8, bendCompliance: 1e-5, friction: 0.4, thickness: 0.005 },
  );
  cloth.body = body;
  cloth.seams = new Uint32Array(pairs);
  cloth.seamCompliance = 1e-7;
  // 1. sew without gravity, 2. let it fall onto the body, 3. calm it
  const dt = 1 / 60;
  for (let i = 0; i < 240; i++) cloth.step(dt, 16);
  cloth.params.gravity = -9.81;
  cloth.params.damping = 1.0;
  for (let i = 0; i < 360; i++) cloth.step(dt, 16);
  cloth.params.damping = 3.0;
  for (let i = 0; i < 120; i++) cloth.step(dt, 16);

  // weld: union-find over the seam pairs
  const parent = new Int32Array(nr).map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let k = 0; k < pairs.length; k += 2) {
    const a = find(pairs[k]);
    const b = find(pairs[k + 1]);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  }
  const physIndex = new Int32Array(nr).fill(-1);
  let np = 0;
  for (let i = 0; i < nr; i++) if (find(i) === i) physIndex[i] = np++;
  const map = new Uint32Array(nr);
  for (let i = 0; i < nr; i++) map[i] = physIndex[find(i)];
  const ppos = new Float32Array(np * 3);
  const cnt = new Float32Array(np);
  for (let i = 0; i < nr; i++) {
    const j = map[i];
    ppos[j * 3] += cloth.pos[i * 3];
    ppos[j * 3 + 1] += cloth.pos[i * 3 + 1];
    ppos[j * 3 + 2] += cloth.pos[i * 3 + 2];
    cnt[j]++;
  }
  for (let j = 0; j < np; j++) {
    ppos[j * 3] /= cnt[j];
    ppos[j * 3 + 1] /= cnt[j];
    ppos[j * 3 + 2] /= cnt[j];
  }
  const ptri = [];
  for (let t = 0; t < tri.length; t += 3) {
    const a = map[tri[t]], b = map[tri[t + 1]], cc = map[tri[t + 2]];
    if (a === b || b === cc || a === cc) continue;
    ptri.push(a, b, cc);
  }
  // constraints on the welded cloth: stretch from the pattern (each edge measured in its own piece); bends across
  // the seams keep the shape they were sewn into
  const stretch = [];
  const stretchRest = [];
  const seen = new Map();
  for (let t = 0; t < tri.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const i = tri[t + e];
      const j = tri[t + ((e + 1) % 3)];
      const a = map[i], b = map[j];
      if (a === b) continue;
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (seen.has(key)) continue;
      seen.set(key, true);
      stretch.push(a, b);
      stretchRest.push(Math.hypot(flat[i * 2] - flat[j * 2], flat[i * 2 + 1] - flat[j * 2 + 1]));
    }
  }
  const PT = new Uint32Array(ptri);
  const bendAll = constraintsFromTriangles(ppos, PT);
  // interior bends: flat rest (fabric wants to lie flat); seam-crossing ones keep their sewn distance
  const pieceOfPhys = new Int32Array(np).fill(-1);
  const multi = new Uint8Array(np);
  for (let i = 0; i < nr; i++) {
    const j = map[i];
    if (pieceOfPhys[j] === -1) pieceOfPhys[j] = piece[i];
    else if (pieceOfPhys[j] !== piece[i]) multi[j] = 1;
  }
  const flatOfPhys = new Float32Array(np * 2);
  for (let i = 0; i < nr; i++) {
    const j = map[i];
    flatOfPhys[j * 2] = flat[i * 2];
    flatOfPhys[j * 2 + 1] = flat[i * 2 + 1];
  }
  const bendRest = new Float32Array(bendAll.bendRest.length);
  for (let k = 0; k < bendAll.bendRest.length; k++) {
    const a = bendAll.bend[k * 2], b = bendAll.bend[k * 2 + 1];
    const samePiece = pieceOfPhys[a] === pieceOfPhys[b] && !multi[a] && !multi[b];
    bendRest[k] = samePiece
      ? Math.hypot(flatOfPhys[a * 2] - flatOfPhys[b * 2], flatOfPhys[a * 2 + 1] - flatOfPhys[b * 2 + 1])
      : bendAll.bendRest[k];
  }
  // seams are stiffer than the cloth (two layers of fabric and the stitching): bends along each seam line (every
  // other vertex), and the bends that touch a seam counted twice, so a seam runs straight instead of rippling
  const extra = [];
  const extraRest = [];
  const d3 = (i, j) => Math.hypot(ppos[i * 3] - ppos[j * 3], ppos[i * 3 + 1] - ppos[j * 3 + 1], ppos[i * 3 + 2] - ppos[j * 3 + 2]);
  for (const [a] of seams) {
    const [pa, sa] = a.split('.');
    const lineIdx = meshed[pa].segIndex[sa].map((i) => map[base[pa] + i]);
    for (let k = 0; k + 2 < lineIdx.length; k++) {
      extra.push(lineIdx[k], lineIdx[k + 2]);
      extraRest.push(d3(lineIdx[k], lineIdx[k + 2]));
    }
  }
  for (let k = 0; k < bendRest.length; k++) {
    const a = bendAll.bend[k * 2], b = bendAll.bend[k * 2 + 1];
    if (multi[a] || multi[b]) {
      extra.push(a, b);
      extraRest.push(bendRest[k]);
    }
  }
  const bendPairs = new Uint32Array(bendAll.bend.length + extra.length);
  bendPairs.set(bendAll.bend);
  bendPairs.set(extra, bendAll.bend.length);
  const bendRestAll = new Float32Array(bendRest.length + extraRest.length);
  bendRestAll.set(bendRest);
  bendRestAll.set(extraRest, bendRest.length);
  // settle the welded cloth once more with its final constraints
  const final = new Cloth(
    { pos: ppos, tri: PT, stretch: new Uint32Array(stretch), stretchRest: new Float32Array(stretchRest), bend: bendPairs, bendRest: bendRestAll },
    { damping: 3.0, friction: 0.5, bendCompliance: 1.2e-5 },
  );
  final.body = body;
  for (let i = 0; i < 240; i++) final.step(dt, 16);

  // the hem, neck and sleeve openings: boundary render vertices, for the stitch lines in the print atlas
  const result = {
    label,
    h,
    physCount: np,
    renderCount: nr,
    body,
    uvScale: UV_SCALE,
    pieces: Object.fromEntries(Object.entries(pieces).map(([k, p]) => [k, { uv: p.uv }])),
    pattern: Object.fromEntries(Object.entries(pieces).map(([k, p]) => [k, p.segs.map((s) => ({ name: s.name, pts: s.pts.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) }))])),
  };
  const buffers = {
    position: final.pos, // phys n x 3 (draped)
    triangles: PT, // phys
    stretch: final.stretch,
    stretchRest: final.stretchRest,
    bend: final.bend,
    bendRest: final.bendRest,
    renderMap: map, // render -> phys
    renderUv: new Float32Array(uv),
    renderFlat: flat2, // pattern coordinates (m), for the print placement
    renderPiece: new Uint8Array(piece),
    renderTriangles: T,
  };
  return { result, buffers };
}

function write({ result, buffers }) {
  fs.mkdirSync(OUT, { recursive: true });
  const layout = {};
  const parts = [];
  let offset = 0;
  for (const [k, arr] of Object.entries(buffers)) {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      parts.push(new Uint8Array(pad));
      offset += pad;
    }
    layout[k] = { type: arr.constructor.name, offset, length: arr.length };
    parts.push(bytes);
    offset += bytes.byteLength;
  }
  fs.writeFileSync(`${OUT}tee-${result.label}.bin`, Buffer.concat(parts.map((p) => Buffer.from(p))));
  fs.writeFileSync(`${OUT}tee-${result.label}.json`, JSON.stringify({ ...result, layout }));
  console.log(`tee-${result.label}: ${result.physCount} particles, ${buffers.triangles.length / 3} triangles, ${result.renderCount} render vertices, ${(offset / 1024).toFixed(0)} KB`);
}

const t0 = Date.now();
write(build(0.021, 'hi'));
write(build(0.03, 'lo'));
console.log(`sewn in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
