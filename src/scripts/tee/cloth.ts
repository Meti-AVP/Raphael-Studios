// Cloth: extended position-based dynamics (XPBD) with small steps, after Macklin et al. "Small Steps in Physics
// Simulation" (2019). Every substep integrates, then projects each constraint once:
//   stretch   the mesh's edges keep their pattern length (cotton jersey stretches a little: low compliance)
//   bend      the far corners of neighbouring triangles keep their distance (soft: the fabric folds)
//   attach    grabbed or pinned particles follow their targets
//   body      particles stay outside the wearer (capsules), with friction
// plus gravity, air drag on each triangle (what makes fabric float and flutter instead of falling like a sheet of
// metal), and a small velocity damping. Plain arrays only: it runs in a worker, and in Node when the shirt is sewn.
// Erasable TypeScript only (no enums, no parameter properties) so Node can run it as it is.

export interface Capsule {
  /** segment end points and radius (metres); scale: squash the capsule (x, z) for an oval torso */
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  sx?: number;
  sz?: number;
}

export interface ClothSetup {
  /** particle positions, n x 3 */
  pos: Float32Array;
  /** triangles (indices into pos) */
  tri: Uint32Array;
  /** constraint pairs [i, j, i, j, ...] with rest lengths */
  stretch: Uint32Array;
  stretchRest: Float32Array;
  bend: Uint32Array;
  bendRest: Float32Array;
  /** 1 for free particles, 0 for fixed ones */
  invMass?: Float32Array;
}

export interface ClothParams {
  gravity: number;
  stretchCompliance: number;
  bendCompliance: number;
  damping: number;
  /** 1/2 x air density x drag coefficient (kg/m3): ~0.7 for a flat sheet */
  drag: number;
  /** skin friction of air along the surface (a small fraction of drag) */
  skin: number;
  /** fabric weight, kg/m2 (cotton jersey: ~0.18) */
  density: number;
  thickness: number;
  friction: number;
}

export const defaultParams: ClothParams = {
  gravity: -9.81,
  stretchCompliance: 2e-8,
  bendCompliance: 4e-6,
  damping: 0.4,
  drag: 0.7,
  skin: 0.02,
  density: 0.18,
  thickness: 0.006,
  friction: 0.25,
};

export class Cloth {
  n: number;
  pos: Float32Array;
  prev: Float32Array;
  vel: Float32Array;
  invMass: Float32Array;
  tri: Uint32Array;
  stretch: Uint32Array;
  stretchRest: Float32Array;
  bend: Uint32Array;
  bendRest: Float32Array;
  params: ClothParams;
  /** lumped particle masses (kg), from the triangles' areas and the fabric weight */
  mass: Float32Array;
  body: Capsule[] = [];
  wind: [number, number, number] = [0, 0, 0];
  /** attachments: particle -> target position and stiffness 0..1 */
  attach = new Map<number, { x: number; y: number; z: number; k: number }>();
  /** extra seam constraints (zero length) used while sewing */
  seams: Uint32Array = new Uint32Array(0);
  seamCompliance = 1e-7;
  private triNormal: Float32Array;

  constructor(s: ClothSetup, params: Partial<ClothParams> = {}) {
    this.n = s.pos.length / 3;
    this.pos = s.pos;
    this.prev = new Float32Array(s.pos);
    this.vel = new Float32Array(s.pos.length);
    this.invMass = s.invMass ?? new Float32Array(this.n).fill(1);
    this.tri = s.tri;
    this.stretch = s.stretch;
    this.stretchRest = s.stretchRest;
    this.bend = s.bend;
    this.bendRest = s.bendRest;
    this.params = { ...defaultParams, ...params };
    this.triNormal = new Float32Array(s.tri.length);
    this.mass = new Float32Array(this.n);
    const pos = this.pos;
    const tri = this.tri;
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3;
      const b = tri[t + 1] * 3;
      const c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      for (const k of [tri[t], tri[t + 1], tri[t + 2]]) this.mass[k] += (area / 3) * this.params.density;
    }
    for (let i = 0; i < this.n; i++) if (this.mass[i] <= 0) this.mass[i] = 1e-5;
  }

  step(dt: number, substeps: number) {
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) this.substep(h);
  }

  private substep(h: number) {
    const { pos, prev, vel, invMass, n } = this;
    const p = this.params;
    this.airForces(h);
    for (let i = 0; i < n; i++) {
      if (invMass[i] === 0) continue;
      const k = i * 3;
      vel[k + 1] += p.gravity * h;
      prev[k] = pos[k];
      prev[k + 1] = pos[k + 1];
      prev[k + 2] = pos[k + 2];
      pos[k] += vel[k] * h;
      pos[k + 1] += vel[k + 1] * h;
      pos[k + 2] += vel[k + 2] * h;
    }
    this.solveDistance(this.stretch, this.stretchRest, p.stretchCompliance / (h * h));
    this.solveDistance(this.bend, this.bendRest, p.bendCompliance / (h * h));
    if (this.seams.length) this.solveSeams(this.seamCompliance / (h * h));
    this.solveAttach();
    this.collideBody();
    const damp = Math.max(0, 1 - p.damping * h);
    for (let i = 0; i < n; i++) {
      if (invMass[i] === 0) continue;
      const k = i * 3;
      vel[k] = ((pos[k] - prev[k]) / h) * damp;
      vel[k + 1] = ((pos[k + 1] - prev[k + 1]) / h) * damp;
      vel[k + 2] = ((pos[k + 2] - prev[k + 2]) / h) * damp;
    }
  }

  private solveDistance(pairs: Uint32Array, rest: Float32Array, alpha: number) {
    const { pos, invMass } = this;
    for (let c = 0, m = rest.length; c < m; c++) {
      const i = pairs[c * 2] * 3;
      const j = pairs[c * 2 + 1] * 3;
      const wi = invMass[i / 3];
      const wj = invMass[j / 3];
      const w = wi + wj;
      if (w === 0) continue;
      const dx = pos[i] - pos[j];
      const dy = pos[i + 1] - pos[j + 1];
      const dz = pos[i + 2] - pos[j + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-9) continue;
      const C = len - rest[c];
      const l = -C / (w + alpha);
      const sx = (dx / len) * l;
      const sy = (dy / len) * l;
      const sz = (dz / len) * l;
      pos[i] += sx * wi;
      pos[i + 1] += sy * wi;
      pos[i + 2] += sz * wi;
      pos[j] -= sx * wj;
      pos[j + 1] -= sy * wj;
      pos[j + 2] -= sz * wj;
    }
  }

  private solveSeams(alpha: number) {
    const { pos, invMass, seams } = this;
    for (let c = 0; c < seams.length; c += 2) {
      const i = seams[c] * 3;
      const j = seams[c + 1] * 3;
      const wi = invMass[seams[c]];
      const wj = invMass[seams[c + 1]];
      const w = wi + wj;
      if (w === 0) continue;
      const s = 1 / (w + alpha);
      for (let a = 0; a < 3; a++) {
        const d = (pos[j + a] - pos[i + a]) * s;
        pos[i + a] += d * wi;
        pos[j + a] -= d * wj;
      }
    }
  }

  private solveAttach() {
    const { pos } = this;
    for (const [i, t] of this.attach) {
      const k = i * 3;
      pos[k] += (t.x - pos[k]) * t.k;
      pos[k + 1] += (t.y - pos[k + 1]) * t.k;
      pos[k + 2] += (t.z - pos[k + 2]) * t.k;
    }
  }

  /** push particles out of the capsules, with a little friction against them */
  private collideBody() {
    const { pos, prev, invMass, body } = this;
    if (!body.length) return;
    const th = this.params.thickness;
    const fr = this.params.friction;
    for (let i = 0; i < this.n; i++) {
      if (invMass[i] === 0) continue;
      const k = i * 3;
      for (const c of body) {
        const sx = c.sx ?? 1;
        const sz = c.sz ?? 1;
        // squashed space: the capsule is round there
        const px = pos[k] / sx;
        const py = pos[k + 1];
        const pz = pos[k + 2] / sz;
        const ax = c.a[0] / sx;
        const ay = c.a[1];
        const az = c.a[2] / sz;
        const bx = c.b[0] / sx - ax;
        const by = c.b[1] - ay;
        const bz = c.b[2] / sz - az;
        const bb = bx * bx + by * by + bz * bz;
        let t = bb > 0 ? ((px - ax) * bx + (py - ay) * by + (pz - az) * bz) / bb : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px - (ax + bx * t);
        const qy = py - (ay + by * t);
        const qz = pz - (az + bz * t);
        const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
        const r = c.r + th;
        if (d >= r || d < 1e-9) continue;
        const push = (r - d) / d;
        // back to world space
        pos[k] += qx * push * sx;
        pos[k + 1] += qy * push;
        pos[k + 2] += qz * push * sz;
        // the contact's normal in world space (the squashed distance's gradient)
        let nx = qx / sx;
        let ny = qy;
        let nz = qz / sz;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        // an inelastic contact: being pushed out of the body gives the fabric no speed away from it (otherwise every
        // resting contact, corrected a millimetre each substep, would throw the cloth off at metres a second: the
        // shirt shook without end)
        const mx = pos[k] - prev[k];
        const my = pos[k + 1] - prev[k + 1];
        const mz = pos[k + 2] - prev[k + 2];
        const vn = mx * nx + my * ny + mz * nz;
        if (vn > 0) {
          prev[k] += nx * vn;
          prev[k + 1] += ny * vn;
          prev[k + 2] += nz * vn;
        }
        // friction: lose part of the motion along the body (only along it: never back into it)
        pos[k] -= (mx - vn * nx) * fr * 0.5;
        pos[k + 1] -= (my - vn * ny) * fr * 0.5;
        pos[k + 2] -= (mz - vn * nz) * fr * 0.5;
      }
    }
  }

  /** air: drag against each triangle's motion through the air (and the wind), spread to its corners */
  private airForces(h: number) {
    const { pos, vel, invMass, tri, wind, mass } = this;
    const { drag, skin } = this.params;
    if (drag === 0) return;
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3;
      const b = tri[t + 1] * 3;
      const c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (area2 < 1e-12) continue;
      nx /= area2;
      ny /= area2;
      nz /= area2;
      // relative air velocity at the triangle
      const rx = (vel[a] + vel[b] + vel[c]) / 3 - wind[0];
      const ry = (vel[a + 1] + vel[b + 1] + vel[c + 1]) / 3 - wind[1];
      const rz = (vel[a + 2] + vel[b + 2] + vel[c + 2]) / 3 - wind[2];
      const vn = rx * nx + ry * ny + rz * nz;
      const area = area2 * 0.5;
      // pressure drag along the normal (N): 1/2 rho Cd A vn|vn|
      const f = -drag * vn * Math.abs(vn) * area;
      // skin friction along the surface
      const tx = rx - vn * nx;
      const ty = ry - vn * ny;
      const tz = rz - vn * nz;
      const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
      const fx = f * nx - skin * ts * tx * area;
      const fy = f * ny - skin * ts * ty * area;
      const fz = f * nz - skin * ts * tz * area;
      for (const k of [a, b, c]) {
        const i = k / 3;
        if (invMass[i] === 0) continue;
        const s = h / 3 / mass[i];
        vel[k] += fx * s;
        vel[k + 1] += fy * s;
        vel[k + 2] += fz * s;
      }
    }
  }

  /** vertex normals (area weighted), for drawing */
  normals(out: Float32Array) {
    const { pos, tri } = this;
    out.fill(0);
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3;
      const b = tri[t + 1] * 3;
      const c = tri[t + 2] * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      out[a] += nx;
      out[a + 1] += ny;
      out[a + 2] += nz;
      out[b] += nx;
      out[b + 1] += ny;
      out[b + 2] += nz;
      out[c] += nx;
      out[c + 1] += ny;
      out[c + 2] += nz;
    }
    for (let i = 0; i < out.length; i += 3) {
      const l = Math.sqrt(out[i] * out[i] + out[i + 1] * out[i + 1] + out[i + 2] * out[i + 2]) || 1;
      out[i] /= l;
      out[i + 1] /= l;
      out[i + 2] /= l;
    }
  }
}

/** Builds stretch (edges) and bend (opposite corners across each inner edge) constraints from triangles. */
export function constraintsFromTriangles(pos: Float32Array, tri: Uint32Array, rest2d?: Float32Array) {
  const edgeMap = new Map<number, number[]>();
  const key = (a: number, b: number) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  for (let t = 0; t < tri.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tri[t + e];
      const b = tri[t + ((e + 1) % 3)];
      const c = tri[t + ((e + 2) % 3)];
      const k = key(a, b);
      const list = edgeMap.get(k);
      if (list) list.push(c);
      else edgeMap.set(k, [c]);
    }
  }
  const dist = (src: Float32Array, dim: number, i: number, j: number) => {
    let s = 0;
    for (let d = 0; d < dim; d++) s += (src[i * dim + d] - src[j * dim + d]) ** 2;
    return Math.sqrt(s);
  };
  const stretch: number[] = [];
  const stretchRest: number[] = [];
  const bend: number[] = [];
  const bendRest: number[] = [];
  for (const [k, opp] of edgeMap) {
    const a = Math.floor(k / 1048576);
    const b = k % 1048576;
    stretch.push(a, b);
    stretchRest.push(rest2d ? dist(rest2d, 2, a, b) : dist(pos, 3, a, b));
    if (opp.length === 2) {
      bend.push(opp[0], opp[1]);
      bendRest.push(rest2d ? dist(rest2d, 2, opp[0], opp[1]) : dist(pos, 3, opp[0], opp[1]));
    }
  }
  return {
    stretch: new Uint32Array(stretch),
    stretchRest: new Float32Array(stretchRest),
    bend: new Uint32Array(bend),
    bendRest: new Float32Array(bendRest),
  };
}
