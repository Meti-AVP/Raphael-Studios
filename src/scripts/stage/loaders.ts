// Loader singletons: glTF with meshopt geometry and KTX2 (Basis) textures. The decoders are files in /decoders/
// (copied from three.js at build time, see astro.config.mjs) and run in workers.
import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let gltf: GLTFLoader | null = null;
let ktx2: KTX2Loader | null = null;

export function ktx2Loader(renderer: WebGLRenderer) {
  if (!ktx2) {
    ktx2 = new KTX2Loader().setTranscoderPath('/decoders/basis/').setWorkerLimit(2).detectSupport(renderer);
  }
  return ktx2;
}

export function gltfLoader(renderer: WebGLRenderer) {
  if (!gltf) {
    gltf = new GLTFLoader().setKTX2Loader(ktx2Loader(renderer)).setMeshoptDecoder(MeshoptDecoder);
  }
  return gltf;
}
