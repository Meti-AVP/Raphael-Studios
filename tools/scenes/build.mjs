// Builds the painted scenes into public/scenes/<id>/ from the reference files listed in config.mjs.
//
//   node tools/scenes/build.mjs                 every scene
//   node tools/scenes/build.mjs --only hero,gifts
//   node tools/scenes/build.mjs --force         ignore the cache
//
// For each scene:
//   a<N>.glb      models: Draco geometry -> meshopt (tiny decoder), textures decoded, rebranded, re-encoded as KTX2
//   a<N>.ktx2     painted backdrops (2 x 2 planes), rebranded, KTX2 with mipmaps
//   timeline.json the animation timeline (Theatre.js project state -> a compact keyframe list, see timeline())
//   poster-d.avif / poster-m.avif  the still shown before (or instead of) the 3D: desktop and phone, rendered from the
//                 remade scene by tools/scenes/posters.mjs (art/posters/), never the reference's own stills
//   scene.json    what the site's engine reads: assets in timeline order, sizes, camera name
//
// Texture edits live in tools/scenes/rebrand.py (one function per texture); a texture without an edit is copied.
// Cache: .cache/scenes/ keeps each edited texture's KTX2, keyed by the source bytes and rebrand.py's text.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { reorder, quantize, prune, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { scenes, shared } from './config.mjs';
import { decodeKTX2, encodeKTX2 } from './ktx.mjs';
import { findScreen } from './screen.mjs';
import { transforms } from './replace.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = path.join(ROOT, 'public/scenes');
const CACHE = path.join(ROOT, '.cache/scenes');
const REBRAND = path.join(ROOT, 'tools/scenes/rebrand.py');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const force = args.includes('--force');

fs.mkdirSync(CACHE, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const rebrandText = fs.readFileSync(REBRAND, 'utf8');
const hash = (...parts) => {
  const h = crypto.createHash('sha1');
  for (const p of parts) h.update(p);
  return h.digest('hex').slice(0, 16);
};

/** Run rebrand.py on a decoded texture. Returns RGBA (edited or untouched) and whether an edit applied. */
function rebrand(scene, texName, rgba) {
  const tmp = path.join(CACHE, `tmp-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  const src = path.join(tmp, 'in.png');
  const dst = path.join(tmp, 'out.png');
  const png = new PNG({ width: rgba.width, height: rgba.height });
  png.data = Buffer.from(rgba.data);
  fs.writeFileSync(src, PNG.sync.write(png));
  fs.rmSync(dst, { force: true });
  const r = spawnSync('py', [REBRAND, scene, texName, src, dst], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`rebrand.py failed for ${scene}/${texName}:\n${r.stderr}`);
  if (r.stdout.trim()) console.log('   ', r.stdout.trim().replace(/\n/g, '\n    '));
  if (!fs.existsSync(dst)) return { ...rgba, edited: false };
  const out = PNG.sync.read(fs.readFileSync(dst));
  return { width: out.width, height: out.height, data: new Uint8Array(out.data), edited: true };
}

/** where a repainted texture would be (v3: art/scenes/<scene>/<texture>.png replaces the texture whole) */
export const artFile = (scene, texName) => path.join(ROOT, 'art/scenes', scene, `${texName.replace(/[^\w.-]+/g, '_')}.png`);

/** decode -> repainted art, or rebrand -> encode, cached */
async function texture(scene, texName, ktxBytes, { mipmaps = true } = {}) {
  const art = artFile(scene, texName);
  const artBytes = fs.existsSync(art) ? fs.readFileSync(art) : null;
  const key = hash(ktxBytes, artBytes ?? rebrandText, scene, texName, String(mipmaps));
  const cached = path.join(CACHE, `${scene}--${texName.replace(/[^\w.-]+/g, '_')}--${key}.ktx2`);
  if (!force && fs.existsSync(cached)) return { bytes: fs.readFileSync(cached), cached: true };
  if (artBytes) {
    const png = PNG.sync.read(artBytes);
    const bytes = await encodeKTX2(new Uint8Array(png.data), { width: png.width, height: png.height, mipmaps, quality: 150 });
    fs.writeFileSync(cached, bytes);
    return { bytes, edited: true, art: true, width: png.width, height: png.height };
  }
  const rgba = await decodeKTX2(ktxBytes);
  const edited = rebrand(scene, texName, rgba);
  const bytes = await encodeKTX2(edited.data, { width: edited.width, height: edited.height, mipmaps, quality: 150 });
  fs.writeFileSync(cached, bytes);
  return { bytes, edited: edited.edited, width: edited.width, height: edited.height };
}

async function glb(scene, src, dst, remove = [], screens = [], transform = null) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  if (transform) await transforms[transform](doc); // v4: the reference's geometry replaced by the studio's (replace.mjs)
  // parts that only make sense for the reference (e.g. its logo modelled in 3D)
  // (the whole subtree: a removed figure takes its bones, and so its animation's channels, with it; prune then drops them)
  const drop = (n) => {
    for (const c of n.listChildren()) drop(c);
    n.dispose();
  };
  for (const node of root.listNodes()) if (remove.includes(node.getName())) drop(node);
  for (const a of root.listAnimations()) {
    for (const c of a.listChannels()) if (!c.getTargetNode()) c.dispose();
    if (!a.listChannels().length) a.dispose();
  }
  // and the animation channels that moved them (a channel without its node is not a valid one)
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      if (ch.getTargetNode()) continue;
      ch.getSampler()?.dispose();
      ch.dispose();
    }
    if (!anim.listChannels().length) anim.dispose();
  }
  for (const [i, tex] of root.listTextures().entries()) {
    if (tex.getMimeType() !== 'image/ktx2') continue;
    const name = `${path.basename(src, '.glb')}#${i}:${tex.getName() || 'tex'}`;
    const t = await texture(scene, name, tex.getImage());
    tex.setImage(t.bytes);
    console.log(`   texture ${name}${t.cached ? ' (cached)' : t.art ? ' (repainted)' : t.edited ? ' (rebranded)' : ''}`);
  }
  // painted (self-lit) surfaces never read normals: drop them; metal parts keep theirs for the studio reflections
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const painted = !!mat?.getEmissiveTexture() || /unlit/i.test(mat?.getName() ?? '') || mat?.getExtension('KHR_materials_unlit');
      if (painted && !/shiny|metal/i.test(`${mesh.getName()} ${mat?.getName()}`)) {
        prim.getAttribute('NORMAL')?.dispose();
        prim.getAttribute('TANGENT')?.dispose();
      }
    }
  }
  // geometry: Draco -> meshopt
  for (const ext of root.listExtensionsUsed()) if (ext instanceof KHRDracoMeshCompression) ext.dispose();
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await doc.transform(dedup(), prune({ keepAttributes: true }), reorder({ encoder: MeshoptEncoder }), quantize());
  // live screens (v4): found on the model as written, in the node space the page will see
  const found = [];
  for (const sc of screens) {
    const f = await findScreen(doc, sc.node, sc.maxL ?? 0.1);
    if (f) found.push({ id: sc.id, node: sc.node, from: sc.from, to: sc.to, corners: f.corners });
  }
  await io.write(dst, doc);
  const info = { meshes: root.listMeshes().length, animations: root.listAnimations().map((a) => a.getName()), screens: found };
  return info;
}

/** Theatre.js project state -> { length, objects: { key: { static, tracks: { 'a.b': [[pos, value, h0, h1, h2, h3, hold, connected], ...] } } } } */
function timeline(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sheet = Object.values(j.sheetsById)[0];
  const objects = {};
  for (const [key, st] of Object.entries(sheet.staticOverrides?.byObject ?? {})) objects[key] = { static: st, tracks: {} };
  for (const [key, t] of Object.entries(sheet.sequence?.tracksByObject ?? {})) {
    objects[key] ??= { static: {}, tracks: {} };
    for (const [propPath, id] of Object.entries(t.trackIdByPropPath)) {
      const kfs = t.trackData[id]?.keyframes ?? [];
      if (!kfs.length) continue;
      const round = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : v);
      objects[key].tracks[JSON.parse(propPath).join('.')] = kfs.map((k) => [
        round(k.position),
        typeof k.value === 'object' ? k.value : round(k.value),
        ...(k.handles ?? [0.5, 1, 0.5, 0]).map(round),
        k.type === 'hold' ? 1 : 0,
        k.connectedRight === false ? 0 : 1,
      ]);
    }
  }
  return { length: sheet.sequence?.length ?? 10, objects };
}

/**
 * The still shown before (or instead of) the 3D. v3 never uses the reference's own stills (they show the original
 * figures): the stills are rendered from the remade scenes by tools/scenes/posters.mjs into art/posters/, and copied
 * from there. Until a scene has been rendered, a plain dark placeholder stands in.
 */
async function poster(scene, which, src, dst) {
  const rendered = path.join(ROOT, 'art/posters', `${scene}-${which === 'desktop' ? 'd' : 'm'}.avif`);
  if (fs.existsSync(rendered)) {
    fs.copyFileSync(rendered, dst);
    const m = await sharp(rendered).metadata();
    return { width: m.width, height: m.height };
  }
  console.warn(`    ${scene}: no rendered ${which} still yet (run tools/scenes/posters.mjs): a placeholder for now`);
  const [width, height] = which === 'desktop' ? [1920, 1200] : [804, 1748];
  await sharp({ create: { width, height, channels: 3, background: '#14201e' } }).avif({ quality: 40 }).toFile(dst);
  return { width, height };
}

// importing this file (tools/scenes/art.mjs) only borrows its helpers: it builds when it is run
const main = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const t0 = Date.now();
for (const s of main ? scenes : []) {
  if (only && !only.includes(s.id)) continue;
  console.log(`\n# ${s.id} (${s.ref})`);
  const dir = path.join(OUT, s.id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { id: s.id, camera: s.camera ?? null, assets: [], posters: {} };
  for (const [i, a] of s.assets.entries()) {
    const n = i + 1;
    if (a.kind === 'glb' && a.local) {
      // v4: a model made here (a painted relief: tools/scenes/remake/relief.mjs), copied as it is
      const src = path.join(ROOT, a.local);
      if (!fs.existsSync(src)) {
        if (a.optional) {
          console.log(`   ${a.local}: not made yet, left out`);
          continue;
        }
        throw new Error(`missing ${a.local}`);
      }
      fs.copyFileSync(src, path.join(dir, `a${n}.glb`));
      const doc = await io.read(src);
      const info = { meshes: doc.getRoot().listMeshes().length, animations: doc.getRoot().listAnimations().map((x) => x.getName()) };
      manifest.assets.push({ key: a.key ?? `asset-${n}`, kind: 'glb', url: `a${n}.glb`, ...info });
    } else if (a.kind === 'glb') {
      const { screens: found, ...info } = await glb(s.id, a.src, path.join(dir, `a${n}.glb`), a.remove ?? [], s.screens ?? [], a.transform ?? null);
      manifest.assets.push({ key: a.key ?? `asset-${n}`, kind: 'glb', url: `a${n}.glb`, ...info });
      if (found.length) manifest.screens = [...(manifest.screens ?? []), ...found];
    } else if (a.generate) {
      // a picture drawn by rebrand.py (e.g. the billboard's poster), as a plane
      const blank = { width: a.width, height: a.height, data: new Uint8Array(a.width * a.height * 4) };
      const g = rebrand(s.id, `generate:${a.generate}`, blank);
      if (!g.edited) throw new Error(`rebrand.py drew nothing for ${s.id}/${a.generate}`);
      const bytes = await encodeKTX2(g.data, { width: g.width, height: g.height, mipmaps: true, quality: 170 });
      fs.writeFileSync(path.join(dir, `a${n}.ktx2`), bytes);
      manifest.assets.push({ key: `asset-${n}`, kind: 'plane', url: `a${n}.ktx2`, width: g.width, height: g.height, aspect: !!a.aspect });
    } else {
      const t = await texture(s.id, path.basename(a.src), fs.readFileSync(a.src));
      fs.writeFileSync(path.join(dir, `a${n}.ktx2`), t.bytes);
      const { width, height } = t.width ? t : await decodeKTX2(t.bytes).then((d) => d);
      manifest.assets.push({ key: `asset-${n}`, kind: 'plane', url: `a${n}.ktx2`, width, height });
    }
    console.log(`   asset-${n} ${a.kind} ${(fs.statSync(path.join(dir, manifest.assets.at(-1).url)).size / 1024).toFixed(0)} KB`);
  }
  // the reference's timelines are converted; a scene made here (v4) has its own, already in the stage's format
  fs.writeFileSync(path.join(dir, 'timeline.json'), s.authored ? fs.readFileSync(path.join(ROOT, s.timeline), 'utf8') : JSON.stringify(timeline(s.timeline)));
  manifest.posters.desktop = { url: 'poster-d.avif', ...(await poster(s.id, 'desktop', s.poster?.desktop, path.join(dir, 'poster-d.avif'))) };
  manifest.posters.mobile = { url: 'poster-m.avif', ...(await poster(s.id, 'mobile', s.poster?.mobile, path.join(dir, 'poster-m.avif'))) };
  fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(manifest, null, 1));
  // what an earlier build left that this one does not use (an asset that changed its kind) would ship for nothing
  const kept = new Set(['scene.json', 'timeline.json', 'poster-d.avif', 'poster-m.avif', ...manifest.assets.map((a) => a.url), ...(s.keep ?? [])]);
  for (const f of fs.readdirSync(dir)) if (!kept.has(f)) fs.rmSync(path.join(dir, f));
}

// shared: the mud normal map (organic edges) and the studio light for metal parts
if (main) {
  const sharedDir = path.join(OUT, 'shared');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.copyFileSync(shared.mudNormal, path.join(sharedDir, 'mud-normal.webp'));
  fs.copyFileSync(shared.studioEnv, path.join(sharedDir, 'studio.pmrem.ktx2'));
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

export { rebrand, io };
