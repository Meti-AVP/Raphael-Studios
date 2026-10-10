// Writes a painted relief (relief.py: mesh.json + texture.png) as a GLB the stage loads like the reference's models:
// one node at the world origin (the positions are already in the scene's space), a painted material (the picture is
// the emissive map: unlit), the texture as KTX2.
//   node tools/scenes/remake/relief.mjs <folder> <out.glb> <name> [breathe | float [amp=0.06] [phase=0]]
// breathe: the node's origin goes to the figure's base and a looping clip 'breathe' lifts it a little (5 s): a seated
// figure's chest and shoulders rise and fall, as the reference's figures move by their skeletons.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
import { encodeKTX2 } from '../ktx.mjs';

const [folder, dst, name = 'relief', ...flags] = process.argv.slice(2);
await MeshoptEncoder.ready;
const mesh = JSON.parse(fs.readFileSync(path.join(folder, 'mesh.json'), 'utf8'));
const src = PNG.sync.read(fs.readFileSync(path.join(folder, 'texture.png')));
// compressed textures come in 4 x 4 blocks: the picture is padded (transparent) to a multiple of 4, the UVs follow
const png = { width: Math.ceil(src.width / 4) * 4, height: Math.ceil(src.height / 4) * 4 };
png.data = new Uint8Array(png.width * png.height * 4);
for (let y = 0; y < src.height; y++) png.data.set(src.data.subarray(y * src.width * 4, (y + 1) * src.width * 4), y * png.width * 4);
mesh.uvs = mesh.uvs.map(([u, v]) => [(u * src.width) / png.width, (v * src.height) / png.height]);
const ktx = await encodeKTX2(png.data, { width: png.width, height: png.height, mipmaps: true, quality: 200 });

const doc = new Document();
doc.createExtension(KHRTextureBasisu).setRequired(true);
const buffer = doc.createBuffer();
const breathe = flags.includes('breathe');
// float: the node's origin at the figure's middle, and a looping clip 'float' (8 s) that lifts and lowers it a little
// and turns it a hair, as a body hanging in the air drifts
const float = flags.includes('float');
const amp = Number((flags.find((f) => f.startsWith('amp=')) || 'amp=0.06').slice(4));
const phase = Number((flags.find((f) => f.startsWith('phase=')) || 'phase=0').slice(6));
let base = [0, 0, 0];
if (breathe || float) {
  const ps = mesh.positions;
  const mid = (k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
  base = [mid(0), breathe ? Math.min(...ps.map((p) => p[1])) : mid(1), mid(2)];
  mesh.positions = ps.map((p) => [p[0] - base[0], p[1] - base[1], p[2] - base[2]]);
}
const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(mesh.positions.flat())).setBuffer(buffer);
const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(mesh.uvs.flat())).setBuffer(buffer);
const n = mesh.positions.length;
const indices = doc
  .createAccessor()
  .setType('SCALAR')
  .setArray(n > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices))
  .setBuffer(buffer);
const texture = doc.createTexture(`${name}-painted`).setImage(ktx).setMimeType('image/ktx2');
const material = doc
  .createMaterial(name)
  .setBaseColorFactor([0, 0, 0, 1])
  .setEmissiveFactor([1, 1, 1])
  .setEmissiveTexture(texture)
  .setAlphaMode('MASK')
  .setAlphaCutoff(0.2)
  .setDoubleSided(true);
const prim = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('TEXCOORD_0', uv).setIndices(indices).setMaterial(material);
const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
doc.createScene('Scene').addChild(node);
if (breathe) {
  node.setTranslation(base);
  const times = doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 2.5, 5])).setBuffer(buffer);
  const scales = doc.createAccessor().setType('VEC3').setArray(new Float32Array([1, 1, 1, 1.004, 1.009, 1.004, 1, 1, 1])).setBuffer(buffer);
  const a = Math.sin(0.0035 / 2);
  const c = Math.cos(0.0035 / 2);
  const turns = doc.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, 0, 0, a, c, 0, 0, 0, 1])).setBuffer(buffer);
  const anim = doc.createAnimation('breathe');
  const s1 = doc.createAnimationSampler().setInput(times).setOutput(scales).setInterpolation('LINEAR');
  const s2 = doc.createAnimationSampler().setInput(times).setOutput(turns).setInterpolation('LINEAR');
  anim.addSampler(s1).addSampler(s2);
  anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('scale').setSampler(s1));
  anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(s2));
}
if (float) {
  node.setTranslation(base);
  const N = 33;
  const T = [], P = [], R = [];
  for (let k = 0; k < N; k++) {
    const t = (k / (N - 1)) * 8;
    const w = (t / 8) * Math.PI * 2 + phase;
    T.push(t);
    P.push(base[0] + Math.sin(w) * amp * 0.25, base[1] + Math.sin(w) * amp, base[2] + Math.cos(w) * amp * 0.2);
    const az = Math.sin(w + 0.8) * 0.012;
    const ay = Math.cos(w) * 0.02;
    // (z then y, small angles: the product is near enough)
    const q = [0, Math.sin(ay / 2), Math.sin(az / 2), Math.cos(ay / 2) * Math.cos(az / 2)];
    const l = Math.hypot(...q);
    R.push(...q.map((x) => x / l));
  }
  const times = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(T)).setBuffer(buffer);
  const anim = doc.createAnimation('float');
  const s1 = doc.createAnimationSampler().setInput(times).setOutput(doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer)).setInterpolation('LINEAR');
  const s2 = doc.createAnimationSampler().setInput(times).setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array(R)).setBuffer(buffer)).setInterpolation('LINEAR');
  anim.addSampler(s1).addSampler(s2);
  anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(s1));
  anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(s2));
}
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
// (an animated figure keeps float positions: quantization moves its dequantization into the node's scale, which the clip drives)
await doc.transform(reorder({ encoder: MeshoptEncoder }), ...(breathe || float ? [] : [quantize()]));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(path.dirname(dst), { recursive: true });
await io.write(dst, doc);
console.log(`  ${dst}: ${(fs.statSync(dst).size / 1024).toFixed(0)} KB (${n} vertices, texture ${png.width}x${png.height})`);
