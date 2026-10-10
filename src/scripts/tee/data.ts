// The sewn shirt (tools/tee/build-tee.mjs): physics mesh (welded), render mesh (per piece, with the print atlas UVs),
// constraints, and the body it was draped on.
import type { Capsule } from './cloth';

export interface TeeData {
  physCount: number;
  renderCount: number;
  body: Capsule[];
  uvScale: number;
  pieces: Record<string, { uv: [number, number] }>;
  pattern: Record<string, { name: string; pts: [number, number][] }[]>;
  position: Float32Array;
  triangles: Uint32Array;
  stretch: Uint32Array;
  stretchRest: Float32Array;
  bend: Uint32Array;
  bendRest: Float32Array;
  renderMap: Uint32Array;
  renderUv: Float32Array;
  renderFlat: Float32Array;
  renderPiece: Uint8Array;
  renderTriangles: Uint32Array;
}

const ctors = { Float32Array, Uint32Array, Uint8Array, Uint16Array, Int32Array } as const;

export async function loadTee(quality: 'hi' | 'lo'): Promise<TeeData> {
  const [meta, bin] = await Promise.all([
    fetch(`/tee/tee-${quality}.json`).then((r) => r.json()),
    fetch(`/tee/tee-${quality}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const out: Record<string, unknown> = { ...meta };
  for (const [k, l] of Object.entries(meta.layout as Record<string, { type: keyof typeof ctors; offset: number; length: number }>)) {
    const C = ctors[l.type];
    out[k] = new C(bin, l.offset, l.length);
  }
  return out as unknown as TeeData;
}
