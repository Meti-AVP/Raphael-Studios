// KTX2 <-> RGBA helpers for the scene pipeline (Node).
//   decodeKTX2(bytes)  -> { width, height, data: Uint8Array RGBA }   (Basis transcoder, level 0, layer 0)
//   encodeKTX2(rgba, { width, height, uastc, mipmaps, quality }) -> Uint8Array (.ktx2)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { encodeToKTX2 } from 'ktx2-encoder';

const basisDir = fileURLToPath(new URL('../../node_modules/three/examples/jsm/libs/basis/', import.meta.url));

let transcoder = null;
async function getTranscoder() {
  if (transcoder) return transcoder;
  const ctx = { console, WebAssembly, Uint8Array, setTimeout, clearTimeout, performance, TextDecoder, TextEncoder, URL };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(basisDir, 'basis_transcoder.js'), 'utf8') + '\nthis.BASIS = BASIS;', ctx);
  transcoder = await ctx.BASIS({ wasmBinary: fs.readFileSync(path.join(basisDir, 'basis_transcoder.wasm')) });
  transcoder.initializeBasis();
  return transcoder;
}

export async function decodeKTX2(bytes, layer = 0) {
  const B = await getTranscoder();
  const k = new B.KTX2File(new Uint8Array(bytes));
  try {
    if (!k.isValid()) throw new Error('invalid KTX2');
    const width = k.getWidth();
    const height = k.getHeight();
    if (!k.startTranscoding()) throw new Error('KTX2: cannot transcode');
    const RGBA32 = 13;
    const data = new Uint8Array(k.getImageTranscodedSizeInBytes(0, layer, 0, RGBA32));
    if (!k.transcodeImage(data, 0, layer, 0, RGBA32, 0, -1, -1)) throw new Error('KTX2: transcode failed');
    return { width, height, data, layers: Math.max(1, k.getLayers()), alpha: !!k.getHasAlpha() };
  } finally {
    k.close();
    k.delete();
  }
}

export async function encodeKTX2(rgba, { width, height, uastc = false, mipmaps = true, quality = 192, srgb = true } = {}) {
  const log = console.log;
  console.log = () => {}; // the encoder prints every slice
  try {
    const out = await encodeToKTX2(new Uint8Array(0), {
      isUASTC: uastc,
      generateMipmap: mipmaps,
      qualityLevel: quality,
      compressionLevel: 2,
      needSupercompression: true,
      isSetKTX2SRGBTransferFunc: srgb,
      isPerceptual: srgb,
      imageDecoder: async () => ({ data: new Uint8Array(rgba), width, height }),
    });
    return new Uint8Array(out);
  } finally {
    console.log = log;
  }
}
