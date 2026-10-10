// Keyframed scene timelines (converted from Theatre.js project states by tools/scenes/build.mjs).
// A timeline is evaluated at a position in "viewport heights scrolled since the section entered the screen".
// Between two keyframes the value follows a cubic-bezier easing built from the left key's right handle and the
// right key's left handle (Theatre.js' own interpolation); 'hold' keys and disconnected keys keep their value.

/** [position, value, h0, h1, h2, h3, hold, connectedRight] */
export type Key = [number, unknown, number, number, number, number, 0 | 1, 0 | 1];

export interface TimelineObject {
  static: Record<string, unknown>;
  tracks: Record<string, Key[]>;
}

export interface TimelineData {
  length: number;
  objects: Record<string, TimelineObject>;
}

// Bezier easing solved the way UnitBezier (WebKit, Theatre.js) does: Newton steps, then bisection.
function bezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = sx(u) - t;
    if (Math.abs(x) < 1e-6) return sy(u);
    const d = dx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= x / d;
  }
  let lo = 0;
  let hi = 1;
  u = t;
  for (let i = 0; i < 30 && lo < hi; i++) {
    const x = sx(u);
    if (Math.abs(x - t) < 1e-6) break;
    if (t > x) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return sy(u);
}

function evalTrack(keys: Key[], pos: number): unknown {
  if (pos <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (pos >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= pos) i++;
  const a = keys[i];
  const b = keys[i + 1];
  if (!a[7] || a[6] || typeof a[1] !== 'number' || typeof b[1] !== 'number') {
    // colours ({r,g,b,a}) interpolate per channel
    if (a[7] && !a[6] && a[1] && b[1] && typeof a[1] === 'object' && typeof b[1] === 'object') {
      const t = bezier(a[4], a[5], b[2], b[3], (pos - a[0]) / (b[0] - a[0]));
      const out: Record<string, number> = {};
      for (const k of Object.keys(a[1] as object)) {
        const va = (a[1] as Record<string, number>)[k];
        const vb = (b[1] as Record<string, number>)[k];
        out[k] = va + (vb - va) * t;
      }
      return out;
    }
    return a[1];
  }
  const t = bezier(a[4], a[5], b[2], b[3], (pos - a[0]) / (b[0] - a[0]));
  return (a[1] as number) + ((b[1] as number) - (a[1] as number)) * t;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let o = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof o[p] !== 'object' || o[p] === null) o[p] = {};
    o = o[p] as Record<string, unknown>;
  }
  o[parts[parts.length - 1]] = value;
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

/** One object's values at a position: defaults < static overrides < animated tracks. */
export class Timeline {
  constructor(readonly data: TimelineData) {}

  has(key: string) {
    return key in this.data.objects;
  }

  values<T extends Record<string, unknown>>(key: string, defaults: T, pos: number): T {
    const obj = this.data.objects[key];
    if (!obj) return defaults;
    const out = deepMerge(defaults, obj.static) as Record<string, unknown>;
    for (const [path, keys] of Object.entries(obj.tracks)) setPath(out, path, evalTrack(keys, pos));
    return out as T;
  }
}
