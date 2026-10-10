// Study helper: each reference model's nodes (mesh, skin, vertices, texture), and what its animations move.
//   node tools/scenes/graph.mjs <reference models folder>
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : f.endsWith('.glb') && files.push(p); } })(process.argv[2]);
for (const file of files) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  console.log(`\n# ${path.basename(file)}`);
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh && !node.getSkin()) continue;
    let verts = 0;
    let tex = '';
    for (const p of mesh?.listPrimitives() ?? []) {
      verts += p.getAttribute('POSITION')?.getCount() ?? 0;
      const m = p.getMaterial();
      const t = m?.getBaseColorTexture() ?? m?.getEmissiveTexture();
      if (t) tex = `${t.getName() || t.getURI()} ${t.getSize()?.join('x') ?? ''}`;
    }
    const morph = mesh?.listPrimitives()[0]?.listTargets().length ?? 0;
    console.log(`  ${node.getName().padEnd(34)} verts ${String(verts).padStart(6)} ${node.getSkin() ? 'SKIN' : '    '} ${morph ? 'morph' + morph : '      '} ${tex}`);
  }
  for (const anim of root.listAnimations()) {
    const targets = new Map();
    for (const ch of anim.listChannels()) {
      const n = ch.getTargetNode()?.getName() ?? '?';
      targets.set(n, (targets.get(n) ?? new Set()).add(ch.getTargetPath()));
    }
    const list = [...targets].slice(0, 6).map(([n, s]) => `${n}(${[...s].join('/')})`).join(' ');
    console.log(`  anim "${anim.getName()}" ${anim.listChannels().length} ch: ${list}${targets.size > 6 ? ` +${targets.size - 6} more` : ''}`);
  }
}
