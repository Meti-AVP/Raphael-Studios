// Where a painted monitor's screen is: samples the texture under every triangle of a mesh, keeps the near-black ones,
// and returns the largest flat patch among them (a quad: the screen) with its corners in the node's space.
// tools/scenes/build.mjs uses it on the model as written (quantization changes the node's space), so a scene's live
// screen (config.mjs: screens) is laid exactly over the painted one.
//   node tools/scenes/screen.mjs <file.glb> <mesh name> [max lightness 0..1]      (study: prints what it finds)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeKTX2 } from './ktx.mjs';

/** -> { corners: [tl, tr, bl, br] (node space), normal, area, vertices } or null */
export async function findScreen(doc, meshName, maxL = 0.1) {
  const node = doc.getRoot().listNodes().find((n) => n.getMesh()?.getName() === meshName || n.getName() === meshName);
  if (!node) return null;
  const prim = node.getMesh().listPrimitives()[0];
  const mat = prim.getMaterial();
  const tex = mat.getEmissiveTexture() ?? mat.getBaseColorTexture();
  const img = await decodeKTX2(tex.getImage());
  const pos = prim.getAttribute('POSITION');
  const uv = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices();
  const P = (i) => pos.getElement(i, []);
  const U = (i) => uv.getElement(i, []);
  const light = (u, v) => {
    const x = Math.min(img.width - 1, Math.max(0, Math.round(u * img.width)));
    const y = Math.min(img.height - 1, Math.max(0, Math.round(v * img.height)));
    const k = (y * img.width + x) * 4;
    return (0.299 * img.data[k] + 0.587 * img.data[k + 1] + 0.114 * img.data[k + 2]) / 255;
  };
  const groups = [];
  for (let t = 0; t < idx.getCount(); t += 3) {
    const ids = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
    const uvs = ids.map(U);
    if (light((uvs[0][0] + uvs[1][0] + uvs[2][0]) / 3, (uvs[0][1] + uvs[1][1] + uvs[2][1]) / 3) > maxL) continue;
    const pts = ids.map(P);
    const e1 = pts[1].map((v, i) => v - pts[0][i]);
    const e2 = pts[2].map((v, i) => v - pts[0][i]);
    const c = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...c) || 1;
    const n = c.map((v) => v / len);
    const off = n[0] * pts[0][0] + n[1] * pts[0][1] + n[2] * pts[0][2];
    // flat patches: the same facing (within ~8 degrees) and the same plane
    let g = groups.find((g) => g.n[0] * n[0] + g.n[1] * n[1] + g.n[2] * n[2] > 0.99 && Math.abs(g.off - off) < 0.01 * (1 + Math.abs(off)));
    if (!g) groups.push((g = { n, off, area: 0, verts: new Map() }));
    g.area += len / 2;
    ids.forEach((id, k) => g.verts.set(id, pts[k]));
  }
  if (!groups.length) return null;
  groups.sort((a, b) => b.area - a.area);
  const g = groups[0];
  const vs = [...g.verts.values()];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ctr = [0, 1, 2].map((i) => vs.reduce((s, v) => s + v[i], 0) / vs.length);
  // "up" is the node's +y laid on the patch; "right" completes it, seen from the side the normal points to
  const up0 = [0, 1, 0].map((v, i) => v - g.n[i] * g.n[1]);
  const upLen = Math.hypot(...up0) || 1;
  const up = up0.map((v) => v / upLen);
  const right = cross(up, g.n);
  const rel = (v) => v.map((x, i) => x - ctr[i]);
  const pick = (score) => vs.reduce((b, v) => (score(v) > score(b) ? v : b), vs[0]);
  const tl = pick((v) => dot(rel(v), up) - dot(rel(v), right));
  const tr = pick((v) => dot(rel(v), up) + dot(rel(v), right));
  const bl = pick((v) => -dot(rel(v), up) - dot(rel(v), right));
  const br = pick((v) => -dot(rel(v), up) + dot(rel(v), right));
  const r5 = (v) => v.map((x) => +x.toFixed(5));
  return { corners: [tl, tr, bl, br].map(r5), normal: r5(g.n), area: +g.area.toFixed(5), vertices: vs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const draco3d = (await import('draco3dgltf')).default;
  const { MeshoptDecoder } = await import('meshoptimizer');
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
  const [file, mesh, maxL = '0.1'] = process.argv.slice(2);
  console.log(JSON.stringify(await findScreen(await io.read(file), mesh, Number(maxL))));
}
