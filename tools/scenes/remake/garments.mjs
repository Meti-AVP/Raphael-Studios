// The garments of the showroom, on the atelier's own sewn shirt (public/tee): where its seams lie in 3D, and the parts
// that make it a polo (a collar, a placket with buttons) or a sweatshirt (long sleeves with ribbed cuffs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, v3 } from './glbkit.mjs';

/** the shirt's data, and where the pattern's seams lie on it in 3D (centred on its middle, as teeGeometry; or where
 * the atelier's physics has it, raw) */
export function teeSeams(raw = false) {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/tee/tee-hi.json'), 'utf8'));
  const bin = fs.readFileSync(path.join(ROOT, 'public/tee/tee-hi.bin'));
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const C = { Float32Array, Uint32Array, Uint8Array, Uint16Array, Int32Array };
  const d = {};
  for (const [k, l] of Object.entries(meta.layout)) d[k] = new C[l.type](ab, l.offset, l.length);
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < meta.physCount; i++) {
    cx += d.position[i * 3];
    cy += d.position[i * 3 + 1];
    cz += d.position[i * 3 + 2];
  }
  const c = raw ? [0, 0, 0] : [cx / meta.physCount, cy / meta.physCount, cz / meta.physCount];
  const pieces = Object.keys(meta.pieces);
  const at = (i) => {
    const k = d.renderMap[i] * 3;
    return [d.position[k] - c[0], d.position[k + 1] - c[1], d.position[k + 2] - c[2]];
  };
  /** the 3D points of a seam segment of a piece (render vertices within tol of it in the flat pattern) */
  const seam = (piece, seg, tol = 0.004) => {
    const p = pieces.indexOf(piece);
    const pts = meta.pattern[piece].find((s) => s.name === seg).pts;
    const out = [];
    const seen = new Set();
    for (let i = 0; i < meta.renderCount; i++) {
      if (d.renderPiece[i] !== p) continue;
      const x = d.renderFlat[i * 2];
      const y = d.renderFlat[i * 2 + 1];
      let best = Infinity;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, ay] = pts[k];
        const [bx, by] = pts[k + 1];
        const vx = bx - ax;
        const vy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
        best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
      }
      if (best > tol) continue;
      const key = d.renderMap[i];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ p: at(i), flat: [x, y] });
    }
    return out;
  };
  /** the points of a piece near the flat line x = x0 (a centre line), with their flat y, bottom to top */
  const line = (piece, x0, tol = 0.006) => {
    const p = pieces.indexOf(piece);
    const out = [];
    for (let i = 0; i < meta.renderCount; i++) {
      if (d.renderPiece[i] !== p) continue;
      if (Math.abs(d.renderFlat[i * 2] - x0) > tol) continue;
      out.push({ p: at(i), y: d.renderFlat[i * 2 + 1] });
    }
    return out.sort((a, b) => a.y - b.y);
  };
  return { seam, line };
}

/** a ring of points ordered round a centre, in the plane across an axis */
function ordered(points, centre, axis) {
  const a = v3.norm(axis);
  let u = v3.norm(v3.cross(a, [0, 1, 0]));
  if (!Number.isFinite(u[0]) || v3.len(u) < 0.5) u = v3.norm(v3.cross(a, [1, 0, 0]));
  const w = v3.cross(a, u);
  return points
    .map((p) => {
      const q = v3.sub(p, centre);
      return { p, ang: Math.atan2(q[0] * w[0] + q[1] * w[1] + q[2] * w[2], q[0] * u[0] + q[1] * u[1] + q[2] * u[2]) };
    })
    .sort((x, y) => x.ang - y.ang)
    .map((x) => x.p);
}

export function smoothNormals(pos, tri) {
  const nor = new Float32Array(pos.length);
  for (let t = 0; t < tri.length; t += 3) {
    const [a, b, c] = [tri[t] * 3, tri[t + 1] * 3, tri[t + 2] * 3];
    const n = v3.cross([pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]]);
    for (const k of [a, b, c]) {
      nor[k] += n[0];
      nor[k + 1] += n[1];
      nor[k + 2] += n[2];
    }
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l;
    nor[i + 1] /= l;
    nor[i + 2] /= l;
  }
  return Array.from(nor);
}

/** a strip between rows of points (rows[r][i]), as triangles; closed round when loop */
export function stripGeometry(rows, loop) {
  const pos = [], uv = [], tri = [];
  const n = rows[0].length;
  rows.forEach((row, r) =>
    row.forEach((p, i) => {
      pos.push(...p);
      uv.push(i / (n - 1), r / (rows.length - 1));
    }),
  );
  for (let r = 0; r + 1 < rows.length; r++)
    for (let i = 0; i < (loop ? n : n - 1); i++) {
      const j = (i + 1) % n;
      const a = r * n + i, b = r * n + j, c = (r + 1) * n + i, d = (r + 1) * n + j;
      tri.push(a, c, b, b, c, d);
    }
  return { pos, uv, tri, nor: smoothNormals(pos, tri) };
}

/** a polo: a collar (a stand, then a leaf turned down over the shoulders, open at the front) and a placket with two
 * buttons, made on the shirt's own neckline */
export function poloParts(raw = false) {
  const s = teeSeams(raw);
  const neck = [...s.seam('front', 'neck'), ...s.seam('back', 'neck')].map((q) => q.p);
  const N = neck.reduce((a, p) => v3.add(a, p), [0, 0, 0]).map((v) => v / neck.length);
  let ring = ordered(neck, N, [0, 1, 0]);
  // the opening at the front (as wide as the placket); the ring starts and ends there
  const front = ring.reduce((m, p) => (p[2] > m[2] ? p : m), ring[0]);
  const k0 = ring.indexOf(front);
  ring = [...ring.slice(k0), ...ring.slice(0, k0)].filter((p) => Math.hypot(p[0] - front[0], p[2] - front[2]) > 0.016);
  const out = (p) => v3.norm([p[0] - N[0], 0, p[2] - N[2]]);
  // how near each point is to the opening at the front (0 at the back, 1 at the collar's points): the stand is lower
  // there, and the leaf falls further and comes forward into its points
  const n = ring.length;
  const f = (i) => Math.abs(i / (n - 1) - 0.5) * 2;
  const stand = ring.map((p, i) => v3.add(p, v3.add([0, 0.022 - 0.008 * f(i), 0], v3.mul(out(p), 0.004))));
  const fold = ring.map((p, i) => v3.add(p, v3.add([0, 0.026 - 0.008 * f(i), 0], v3.mul(out(p), 0.011))));
  const leaf = ring.map((p, i) => {
    const k = Math.pow(f(i), 3);
    return v3.add(p, v3.add([0, -0.012 - 0.03 * k, 0.014 * k], v3.mul(out(p), 0.056 + 0.008 * k)));
  });
  const collar = stripGeometry([ring, stand, fold, leaf], false);
  // the placket: down the front centre from the neck, 3 cm wide, a hair off the cloth (in rows, so it can follow it)
  // (the points near the centre line, those at one height averaged; the neckline is at about 0.66 there)
  const near = s.line('front', 0, 0.02).filter((q) => q.y > 0.48);
  const cl = [];
  for (const q of near) {
    const last = cl[cl.length - 1];
    if (last && Math.abs(last.y - q.y) < 1e-4) {
      last.p = v3.mul(v3.add(last.p, q.p), 0.5);
    } else cl.push({ y: q.y, p: q.p });
  }
  const at = (y) => {
    for (let k = 0; k + 1 < cl.length; k++) {
      if (y < cl[k].y || y > cl[k + 1].y) continue;
      const t = (y - cl[k].y) / (cl[k + 1].y - cl[k].y || 1);
      return v3.add(cl[k].p, v3.mul(v3.sub(cl[k + 1].p, cl[k].p), t));
    }
    return (y < cl[0].y ? cl[0] : cl[cl.length - 1]).p;
  };
  const rows = [[], []];
  for (let k = 0; k <= 10; k++) {
    const q = at(0.515 + (0.138 * k) / 10);
    rows[0].push(v3.add(q, [-0.015, 0, 0.003]));
    rows[1].push(v3.add(q, [0.015, 0, 0.003]));
  }
  const placket = stripGeometry(rows, false);
  const buttons = [0.56, 0.61].map((y) => v3.add(at(y), [0, 0, 0.0055]));
  return { collar, placket, buttons };
}

/** a sweatshirt: each short sleeve carried on from its hem down the arm (a little lower as it goes) to a ribbed cuff */
export function sweatParts(raw = false) {
  const s = teeSeams(raw);
  const sleeves = [];
  for (const piece of ['sleeveR', 'sleeveL']) {
    const hem = s.seam(piece, 'hem').map((q) => q.p);
    const cap = [...s.seam(piece, 'capF'), ...s.seam(piece, 'capB')].map((q) => q.p);
    const H = hem.reduce((a, p) => v3.add(a, p), [0, 0, 0]).map((v) => v / hem.length);
    const Cp = cap.reduce((a, p) => v3.add(a, p), [0, 0, 0]).map((v) => v / cap.length);
    let axis = v3.norm(v3.sub(H, Cp));
    const ring = ordered(hem, H, axis);
    const rows = [ring];
    const steps = 10;
    let centre = H;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      axis = v3.norm(v3.add(axis, [0, -0.05, 0]));
      centre = v3.add(centre, v3.mul(axis, 0.4 / steps));
      rows.push(ring.map((p) => v3.add(centre, v3.mul(v3.sub(p, H), 1 - 0.22 * t))));
    }
    const cuffRows = [rows[rows.length - 1]];
    for (let k = 1; k <= 3; k++) {
      const c2 = v3.add(centre, v3.mul(axis, (0.065 * k) / 3));
      cuffRows.push(ring.map((p) => v3.add(c2, v3.mul(v3.sub(p, H), 0.7))));
    }
    sleeves.push({ sleeve: stripGeometry(rows, true), cuff: stripGeometry(cuffRows, true) });
  }
  return sleeves;
}
