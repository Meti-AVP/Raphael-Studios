// The shirt's physics, off the main thread. The page sends the sewn cloth once, then a "step" per frame with the
// frame time and what the reader is doing (holding a point, the wind); the worker answers with the positions.
// Positions travel as transferred buffers (no copies): the page sends an empty one back with each step.
import { Cloth, type Capsule } from './cloth';

let cloth: Cloth | null = null;
let rest: Float32Array | null = null;
let substeps = 12;

interface Setup {
  type: 'setup';
  pos: Float32Array;
  tri: Uint32Array;
  stretch: Uint32Array;
  stretchRest: Float32Array;
  bend: Uint32Array;
  bendRest: Float32Array;
  body: Capsule[];
  substeps: number;
  params: Record<string, number>;
}
interface Step {
  type: 'step';
  dt: number;
  buffer: Float32Array;
  /** grabbed particles and where the pointer wants them */
  grab: { ids: number[]; weights: number[]; x: number; y: number; z: number } | null;
  /** the air's velocity in the shirt's own frame (m/s); a click adds a gust */
  wind: [number, number, number];
  params?: Record<string, number>;
}
interface Reset {
  type: 'reset';
}

self.onmessage = (e: MessageEvent<Setup | Step | Reset>) => {
  const m = e.data;
  if (m.type === 'setup') {
    rest = new Float32Array(m.pos);
    cloth = new Cloth(
      { pos: new Float32Array(m.pos), tri: m.tri, stretch: m.stretch, stretchRest: m.stretchRest, bend: m.bend, bendRest: m.bendRest },
      m.params,
    );
    cloth.body = m.body;
    substeps = m.substeps;
    return;
  }
  if (m.type === 'reset') {
    if (cloth && rest) {
      cloth.pos.set(rest);
      cloth.vel.fill(0);
    }
    return;
  }
  if (!cloth) return;
  if (m.params) Object.assign(cloth.params, m.params);
  cloth.attach.clear();
  if (m.grab) {
    // the grabbed point leads; its neighbours follow more softly (a hand pinches an area, not a single thread)
    const { x, y, z } = m.grab;
    const p = cloth.pos;
    const first = m.grab.ids[0] * 3;
    const dx = x - p[first];
    const dy = y - p[first + 1];
    const dz = z - p[first + 2];
    m.grab.ids.forEach((id, k) => {
      const w = m.grab!.weights[k];
      cloth!.attach.set(id, { x: p[id * 3] + dx, y: p[id * 3 + 1] + dy, z: p[id * 3 + 2] + dz, k: 0.35 * w });
    });
  }
  cloth.wind = m.wind;
  const dt = Math.min(1 / 30, Math.max(1 / 240, m.dt));
  cloth.step(dt, substeps);
  // the shirt never leaves its body, however hard it is pulled: no point further than 25 cm from where it rests,
  // none faster than 3 m/s (a pull let go of springs back, it does not fly off)
  const P = cloth.pos;
  const V = cloth.vel;
  const R = rest!;
  for (let i = 0; i < P.length; i += 3) {
    const dx = P[i] - R[i];
    const dy = P[i + 1] - R[i + 1];
    const dz = P[i + 2] - R[i + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 0.25) {
      const k = 0.25 / d;
      P[i] = R[i] + dx * k;
      P[i + 1] = R[i + 1] + dy * k;
      P[i + 2] = R[i + 2] + dz * k;
      V[i] *= 0.5;
      V[i + 1] *= 0.5;
      V[i + 2] *= 0.5;
    }
    const v = Math.sqrt(V[i] * V[i] + V[i + 1] * V[i + 1] + V[i + 2] * V[i + 2]);
    if (v > 3) {
      const k = 3 / v;
      V[i] *= k;
      V[i + 1] *= k;
      V[i + 2] *= k;
    }
  }
  const out = m.buffer.length === cloth.pos.length ? m.buffer : new Float32Array(cloth.pos.length);
  out.set(cloth.pos);
  (self as unknown as Worker).postMessage({ type: 'positions', buffer: out }, [out.buffer]);
};
