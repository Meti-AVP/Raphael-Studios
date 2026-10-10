// Study helper: where each mesh of a scene model sits in its texture (UV bounds in pixels), so rebrand.py can edit
// exactly the bag, the cap or the card and nothing else.   node tools/scenes/uvmap.mjs <file.glb> [...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
});
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const texIndex = new Map(root.listTextures().map((t, i) => [t, i]));
  console.log('\n#', file.split(/[\/]/).pop());
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      const mat = prim.getMaterial();
      const tex = mat?.getEmissiveTexture() ?? mat?.getBaseColorTexture();
      if (!uv || !tex) continue;
      const [w, h] = tex.getSize() ?? [0, 0];
      let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      const el = [];
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, el);
        u0 = Math.min(u0, el[0]); u1 = Math.max(u1, el[0]);
        v0 = Math.min(v0, el[1]); v1 = Math.max(v1, el[1]);
      }
      const px = (u) => Math.round(u * w);
      const py = (v) => Math.round(v * h);
      console.log(`${mesh.getName().padEnd(34)} tex ${texIndex.get(tex)} ${w}x${h}  x ${px(u0)}-${px(u1)}  y ${py(v0)}-${py(v1)}  (${uv.getCount()} v)`);
    }
  }
}
