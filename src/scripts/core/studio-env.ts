// The studios' lighting environment, ready-made (tools/env/bake-env.mjs): three.js's RoomEnvironment prefiltered for
// rough and glossy surfaces, read from one small picture instead of being built in each 3D view (building it compiles
// a heavy shader, which stalls a phone for most of a second). Decoded once per page; each view gets its own texture
// of the same data.
import { CubeUVReflectionMapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat, type Camera, type Material, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';

const URL_ = '/studio/room-env.png';
let decoded: Promise<{ data: Uint16Array; w: number; h: number } | null> | null = null;

function decode() {
  decoded ??= (async () => {
    const res = await fetch(URL_);
    if (!res.ok) throw new Error(`${URL_}: ${res.status}`);
    const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const w = bmp.width;
    const h = bmp.height / 2;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h * 2) : Object.assign(document.createElement('canvas'), { width: w, height: h * 2 });
    const x = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    x.drawImage(bmp, 0, 0);
    bmp.close();
    const px = x.getImageData(0, 0, w, h * 2).data;
    // RGBE (mantissas above, exponents below) to half floats, rows from the bottom as the GPU counts them
    const out = new Uint16Array(w * h * 4);
    const one = DataUtils.toHalfFloat(1);
    for (let y = 0; y < h; y++) {
      const o0 = (h - 1 - y) * w * 4;
      for (let i = 0; i < w; i++) {
        const t = (y * w + i) * 4;
        const e = px[(h * w + y * w + i) * 4];
        const f = e ? Math.pow(2, e - 128) / 256 : 0;
        const o = o0 + i * 4;
        out[o] = DataUtils.toHalfFloat(px[t] * f);
        out[o + 1] = DataUtils.toHalfFloat(px[t + 1] * f);
        out[o + 2] = DataUtils.toHalfFloat(px[t + 2] * f);
        out[o + 3] = one;
      }
    }
    return { data: out, w, h };
  })().catch((err) => {
    console.info('[studio] no lighting environment, the lights alone', err);
    return null;
  });
  return decoded;
}

/** a new texture for one view (null if the picture could not be had: the lights then work alone) */
export async function studioEnvironment(): Promise<DataTexture | null> {
  const d = await decode();
  if (!d) return null;
  const t = new DataTexture(d.data, d.w, d.h, RGBAFormat, HalfFloatType);
  t.mapping = CubeUVReflectionMapping;
  t.colorSpace = LinearSRGBColorSpace;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** the next task: lets the page draw a frame between two pieces of heavy work */
export const nextTask = () =>
  new Promise<void>((r) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) s.yield().then(r);
    else setTimeout(r, 0);
  });

/** every texture in a scene onto the GPU, one per task (an upload inside the first frame would hold it up) */
export async function uploadTextures(renderer: WebGLRenderer, root: Object3D, extra: (Texture | null)[] = []) {
  const textures = new Set<Texture>(extra.filter((t): t is Texture => !!t));
  root.traverse((o) => {
    const m = (o as Object3D & { material?: Material | Material[] }).material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) for (const v of Object.values(mat)) if ((v as Texture | null)?.isTexture) textures.add(v as Texture);
  });
  for (const t of textures) {
    renderer.initTexture(t);
    await nextTask();
  }
}

/** compile a scene's materials object by object, a task each (building a big shader's source is real work), then
 *  wait until the GPU has them all (in parallel with the page, where the browser can) */
export async function compileInSteps(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const seen = new Set<Material>();
  const objects: Object3D[] = [];
  scene.traverse((o) => {
    const m = (o as Object3D & { material?: Material | Material[] }).material;
    if (!m) return;
    const mats = Array.isArray(m) ? m : [m];
    if (mats.every((x) => seen.has(x))) return;
    mats.forEach((x) => seen.add(x));
    objects.push(o);
  });
  for (const o of objects) {
    renderer.compile(o, camera, scene);
    await nextTask();
  }
  await renderer.compileAsync(scene, camera);
}
