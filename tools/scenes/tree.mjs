// Study helper: a model's node tree (meshes, skins, transforms) and what each animation moves.
//   node tools/scenes/tree.mjs <file.glb> [depth]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const depth = Number(process.argv[3] || 5);
const f = (a) => a.map((v) => v.toFixed(2)).join(',');
function walk(n, d) {
  const tags = `${n.getMesh() ? ' [mesh]' : ''}${n.getSkin() ? ' [skin]' : ''}`;
  console.log(`${'  '.repeat(d)}${n.getName()}${tags} t(${f(n.getTranslation())}) r(${f(n.getRotation())}) s(${f(n.getScale())})`);
  if (d < depth) for (const c of n.listChildren()) walk(c, d + 1);
}
for (const n of root.listScenes()[0].listChildren()) walk(n, 0);
for (const a of root.listAnimations()) {
  console.log('anim', a.getName(), [...new Set(a.listChannels().map((c) => c.getTargetNode()?.getName()))].join(','));
}
