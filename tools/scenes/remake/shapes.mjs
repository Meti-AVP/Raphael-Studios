// Shapes for the showroom's soft goods (products.mjs): a rounded box whose six faces each map to their own place in
// an atlas (a bag's front, its back, its ends, its top, its base), a flat strap along a curve, a rolled-up blanket.
import { v3 } from './glbkit.mjs';
import { smoothNormals } from './garments.mjs';

/**
 * A box w x h x d with its edges rounded (radius r), subdivided n times along each face; the faces' UVs are their
 * rectangles in an atlas: uv = { front, back, right, left, top, bottom } as [u0, v0, u1, v1] (v down).
 * soft (0..1) puffs the faces out a little in their middles, as a padded bag does; warp(point) moves each point after
 * (a bag's wings tapering, its body bent round a waist).
 * Each face's UVs read as the face is seen from outside: u to the right, v down (the top seen from above with the front
 * at the bottom, the base seen from below with the front at the top).
 */
export function roundedBox(w, h, d, r, uv, { n = 16, soft = 0, warp = null } = {}) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pos = [], uvs = [], tri = [];
  // each face: its normal axis, its in-plane axes (u to the right, v down), and its rectangle in the atlas
  const faces = [
    { k: 'front', n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
    { k: 'back', n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
    { k: 'right', n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
    { k: 'left', n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
    { k: 'top', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { k: 'bottom', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  ];
  const half = [hx, hy, hz];
  for (const f of faces) {
    const base = pos.length / 3;
    const extU = Math.abs(f.u[0]) * hx + Math.abs(f.u[1]) * hy + Math.abs(f.u[2]) * hz;
    const extV = Math.abs(f.v[0]) * hx + Math.abs(f.v[1]) * hy + Math.abs(f.v[2]) * hz;
    const extN = Math.abs(f.n[0]) * hx + Math.abs(f.n[1]) * hy + Math.abs(f.n[2]) * hz;
    const [u0, v0, u1, v1] = uv[f.k];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * 2 - 1;
        const b = (j / n) * 2 - 1;
        // the point on the flat face, then pulled in to the rounded box: the inner box shrunk by r, plus r along the
        // direction from the inner box to the point
        const p = v3.add(v3.add(v3.mul(f.n, extN), v3.mul(f.u, a * extU)), v3.mul(f.v, b * extV));
        const q = p.map((x, k) => Math.max(-(half[k] - r), Math.min(half[k] - r, x)));
        const dir = v3.norm(v3.sub(p, q));
        let out = v3.add(q, v3.mul(dir, r));
        if (soft) {
          const puff = (1 - a * a) * (1 - b * b) * soft;
          out = v3.add(out, v3.mul(f.n, puff * r));
        }
        pos.push(...(warp ? warp(out) : out));
        uvs.push(u0 + (u1 - u0) * (i / n), v0 + (v1 - v0) * (j / n));
      }
    }
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        const b = a + 1;
        const c = a + n + 1;
        const e = c + 1;
        tri.push(a, c, b, b, c, e); // (counter-clockwise seen from outside: the faces look out)
      }
  }
  return { pos, uv: uvs, tri, nor: smoothNormals(pos, tri) };
}

/**
 * a flat strap (of a width) along a polyline of points, its face turned towards `up` where it can: a direction, or a
 * function of the point and its index (a belt round a waist faces out from it, its width upright)
 */
export function strap(points, width, up = [0, 0, 1]) {
  const pos = [], uv = [], tri = [];
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const t = v3.norm(v3.sub(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]));
    let side = v3.norm(v3.cross(t, typeof up === 'function' ? up(points[i], i) : up));
    if (!Number.isFinite(side[0]) || v3.len(side) < 0.5) side = v3.norm(v3.cross(t, [0, 1, 0]));
    if (i) len += v3.len(v3.sub(points[i], points[i - 1]));
    pos.push(...v3.add(points[i], v3.mul(side, -width / 2)), ...v3.add(points[i], v3.mul(side, width / 2)));
    uv.push(0, len * 4, 1, len * 4);
  }
  for (let i = 0; i + 1 < points.length; i++) {
    const a = i * 2;
    tri.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return { pos, uv, tri, nor: smoothNormals(pos, tri) };
}

/**
 * a blanket rolled up and strapped: a soft bundle along x (length l, radius r, a little flattened: ry = r * squash), its
 * ends rounded as fleece folds round them (a superellipse of power p along it). Its side is mapped on sideRect of the
 * atlas: u along it from left to right (|t| <= t0 of its half-length), v round it from the top towards the front, so a
 * text drawn level there reads along the roll, upright, seen from the front and above. Each end is mapped flat on its
 * own rectangle (capRects: left, right), seen from outside: the layers of the roll are drawn there.
 */
export function roll(r, l, opts = {}) {
  const { squash = 0.86, segs = 72, side = 36, cap = 12, p = 5, t0 = 0.9 } = opts;
  const { sideRect = [0, 0, 1, 0.75], capRects = [[0, 0.75, 0.25, 1], [0.25, 0.75, 0.5, 1]] } = opts;
  const prof = (t) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), p)), 1 / p) * (1 + 0.03 * (1 - t * t));
  const k0 = prof(t0);
  // the end's rings evenly in radius: t where the profile falls to k (it falls steadily past t0)
  const tOf = (k) => {
    let lo = t0, hi = 1;
    for (let n = 0; n < 40; n++) {
      const m = (lo + hi) / 2;
      if (prof(m) > k) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const R = r * 1.05;
  const pos = [], uv = [], tri = [];
  const seams = [];
  const grid = (ts, uvOf) => {
    const base = pos.length / 3;
    ts.forEach((t, j) => {
      const k = prof(t);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const q = [(t * l) / 2, Math.cos(a) * r * squash * k, Math.sin(a) * r * k];
        pos.push(...q);
        uv.push(...uvOf(q, t, i, j));
      }
    });
    for (let j = 0; j + 1 < ts.length; j++)
      for (let i = 0; i < segs; i++) {
        const a = base + j * (segs + 1) + i;
        tri.push(a, a + 1, a + segs + 1, a + 1, a + segs + 2, a + segs + 1);
      }
    return base;
  };
  const flat = ([u0, v0, u1, v1], sx) => (q) => [
    (u0 + u1) / 2 + ((sx * q[2]) / R) * ((u1 - u0) / 2),
    (v0 + v1) / 2 + (-q[1] / R) * ((v1 - v0) / 2),
  ];
  const capTs = Array.from({ length: cap + 1 }, (_, m) => tOf((k0 * m) / cap)); // centre .. seam
  capTs[cap] = t0;
  // left end (seen from the left: +z to the right), the side, the right end (seen from the right: -z to the right)
  const left = grid(capTs.map((t) => -t), flat(capRects[0], 1));
  const [su0, sv0, su1, sv1] = sideRect;
  const sideTs = Array.from({ length: side + 1 }, (_, j) => -t0 + (2 * t0 * j) / side);
  const mid = grid(sideTs, (q, t, i) => [su0 + (su1 - su0) * ((t + t0) / (2 * t0)), sv0 + (sv1 - sv0) * (i / segs)]);
  const right = grid([...capTs].reverse(), flat(capRects[1], -1));
  for (let i = 0; i <= segs; i++) {
    seams.push([left + cap * (segs + 1) + i, mid + i]);
    seams.push([mid + side * (segs + 1) + i, right + i]);
  }
  // the normals as if it were one surface: each seam's two copies share theirs
  const nor = smoothNormals(pos, tri);
  for (const [a, b] of seams) {
    const n = v3.norm([nor[a * 3] + nor[b * 3], nor[a * 3 + 1] + nor[b * 3 + 1], nor[a * 3 + 2] + nor[b * 3 + 2]]);
    for (const c of [a, b]) nor.splice(c * 3, 3, ...n);
  }
  return { pos, uv, tri, nor };
}

/** the roll's surface at (x, angle from the top towards the front), pushed out by `out` (for what is strapped on it) */
export function rollPoint(r, l, x, a, { squash = 0.86, p = 5, out = 0 } = {}) {
  const t = (x / l) * 2;
  const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), p)), 1 / p) * (1 + 0.03 * (1 - t * t));
  return [x, Math.cos(a) * (r * squash * k + out), Math.sin(a) * (r * k + out)];
}

/**
 * flat faces, each given by its four corners as seen from the side it faces (top-left, top-right, bottom-left,
 * bottom-right) and its rectangle in the atlas [u0, v0, u1, v1] (v down): a box with sharp edges, a tray, a panel
 */
export function faces() {
  const pos = [], uv = [], tri = [], nor = [];
  const api = {
    quad(tl, tr, bl, br, [u0, v0, u1, v1]) {
      const k = pos.length / 3;
      const n = v3.norm(v3.cross(v3.sub(bl, tl), v3.sub(tr, tl)));
      for (const [p, u, v] of [[tl, u0, v0], [tr, u1, v0], [bl, u0, v1], [br, u1, v1]]) {
        pos.push(...p);
        nor.push(...n);
        uv.push(u, v);
      }
      tri.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      return api;
    },
    out: () => ({ pos, uv, tri, nor }),
  };
  return api;
}

/** a box w x h x d (its base at y = 0) with sharp edges, each face on its own rectangle (or one for all) */
export function slab(w, h, d, uv) {
  const r = (k) => (Array.isArray(uv) ? uv : uv[k]);
  const [x, z] = [w / 2, d / 2];
  return faces()
    .quad([-x, h, z], [x, h, z], [-x, 0, z], [x, 0, z], r('front'))
    .quad([x, h, -z], [-x, h, -z], [x, 0, -z], [-x, 0, -z], r('back'))
    .quad([x, h, z], [x, h, -z], [x, 0, z], [x, 0, -z], r('right'))
    .quad([-x, h, -z], [-x, h, z], [-x, 0, -z], [-x, 0, z], r('left'))
    .quad([-x, h, -z], [x, h, -z], [-x, h, z], [x, h, z], r('top'))
    .quad([-x, 0, z], [x, 0, z], [-x, 0, -z], [x, 0, -z], r('bottom'))
    .out();
}

/** an open box (a tray: no lid) w x h x d, its walls t thick: printed outside (front, back, right, left, bottom), plain inside */
export function tray(w, h, d, t, uv) {
  const [x, z] = [w / 2, d / 2];
  const [xi, zi] = [x - t, z - t];
  const inside = uv.inside;
  return faces()
    .quad([-x, h, z], [x, h, z], [-x, 0, z], [x, 0, z], uv.front)
    .quad([x, h, -z], [-x, h, -z], [x, 0, -z], [-x, 0, -z], uv.back)
    .quad([x, h, z], [x, h, -z], [x, 0, z], [x, 0, -z], uv.right)
    .quad([-x, h, -z], [-x, h, z], [-x, 0, -z], [-x, 0, z], uv.left)
    .quad([-x, 0, z], [x, 0, z], [-x, 0, -z], [x, 0, -z], uv.bottom)
    // the rim
    .quad([-x, h, zi], [x, h, zi], [-x, h, z], [x, h, z], inside)
    .quad([-x, h, -z], [x, h, -z], [-x, h, -zi], [x, h, -zi], inside)
    .quad([-x, h, -zi], [-xi, h, -zi], [-x, h, zi], [-xi, h, zi], inside)
    .quad([xi, h, -zi], [x, h, -zi], [xi, h, zi], [x, h, zi], inside)
    // the inside: its floor, its walls seen from within
    .quad([-xi, t, -zi], [xi, t, -zi], [-xi, t, zi], [xi, t, zi], inside)
    .quad([xi, h, zi], [-xi, h, zi], [xi, t, zi], [-xi, t, zi], inside)
    .quad([-xi, h, -zi], [xi, h, -zi], [-xi, t, -zi], [xi, t, -zi], inside)
    .quad([xi, h, -zi], [xi, h, zi], [xi, t, -zi], [xi, t, zi], inside)
    .quad([-xi, h, zi], [-xi, h, -zi], [-xi, t, zi], [-xi, t, -zi], inside)
    .out();
}

/** a cylinder along x (radius r at its left end, r1 at its right), its side on uv (u along it, v round), its ends flat */
export function cylinder(r, l, { segs = 24, uv = [0, 0, 1, 1], r1 = r } = {}) {
  const pos = [], uvs = [], tri = [], nor = [];
  const [u0, v0, u1, v1] = uv;
  const slope = (r - r1) / l;
  for (let j = 0; j <= 1; j++) {
    const rr = j ? r1 : r;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(-l / 2 + l * j, Math.cos(a) * rr, Math.sin(a) * rr);
      nor.push(...v3.norm([slope, Math.cos(a), Math.sin(a)]));
      uvs.push(u0 + (u1 - u0) * j, v0 + (v1 - v0) * (i / segs));
    }
  }
  for (let i = 0; i < segs; i++) tri.push(i, i + 1, i + segs + 1, i + 1, i + segs + 2, i + segs + 1);
  for (const [s, rr] of [[-1, r], [1, r1]]) {
    const c = pos.length / 3;
    pos.push((s * l) / 2, 0, 0);
    nor.push(s, 0, 0);
    uvs.push(u0, v0);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push((s * l) / 2, Math.cos(a) * rr, Math.sin(a) * rr);
      nor.push(s, 0, 0);
      uvs.push(u0, v0);
    }
    for (let i = 0; i < segs; i++) {
      if (s > 0) tri.push(c, c + 1 + i, c + 2 + i);
      else tri.push(c, c + 2 + i, c + 1 + i);
    }
  }
  return { pos, uv: uvs, tri, nor };
}

/** a ring (radius R, its tube r) lying flat in the xz plane: a key ring */
export function torus(R, r, { segs = 40, sides = 10, uv = [0, 0, 1, 1] } = {}) {
  const pos = [], nor = [], uvs = [], tri = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    for (let j = 0; j <= sides; j++) {
      const b = (j / sides) * Math.PI * 2;
      const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
      pos.push(Math.cos(a) * R + n[0] * r, n[1] * r, Math.sin(a) * R + n[2] * r);
      nor.push(...n);
      uvs.push(uv[0], uv[1]);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < sides; j++) {
      const k = i * (sides + 1) + j;
      const k1 = k + sides + 1;
      tri.push(k, k + 1, k1, k1, k + 1, k1 + 1);
    }
  return { pos, uv: uvs, tri, nor };
}
