// Where on the screen each texel of a scene's painted atlas lands, for editing a painting the way the camera sees it
// (project.py): the dev page in ?poster mode scrolled to a timeline position, then the scene drawn once more off screen
// with every mesh writing, instead of its colour, the texture coordinate it shows there (12 bits a coordinate, packed in
// RGB; alpha 1 on the named meshes, 0 on everything else, which still hides what it stands in front of). Saves
//   frame.png   the page's own frame at that moment (what the reader sees); with --wide or --scale, the scene drawn
//               again the same way as the coordinates (unlit colours, no effects over them)
//   uv.png      the coordinates, the same size, top row first
//   camera.json the camera
// --wide k widens the camera's view k times (the same place, more around it: what other positions of the timeline
// show); --scale s draws both s times the page's size. Needs the dev server.
//
//   node tools/scenes/remake/uvpass.mjs <scene> <position> --meshes "Developer_fg,Dev_hand" [--out dir]
//        [--wide 1.4] [--scale 1.5] [--dpr 2] [--url http://127.0.0.1:4721/]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const [sceneId, posArg] = args;
const pos = Number(posArg);
const url = opt('url', 'http://127.0.0.1:4721/');
const out = opt('out', `D:/RAhpel/.work-raphael/v4-art/${sceneId}/uvpass-${posArg}`);
const meshes = (opt('meshes', '') || '').split(',').filter(Boolean);
const dpr = Number(opt('dpr', 2));
const wide = Number(opt('wide', 1));
const scale = Number(opt('scale', 1));
if (!sceneId || !Number.isFinite(pos) || !meshes.length) {
  console.error('usage: uvpass.mjs <scene> <position> --meshes "A,B"');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: dpr });
await page.goto(`${url}?poster`, { waitUntil: 'load', timeout: 180000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForFunction(() => window.__stage, { timeout: 120000, polling: 250 });
const index = await page.evaluate((id) => [...document.querySelectorAll('[data-section-id]')].findIndex((s) => s.dataset.scene === id), sceneId);
await page.evaluate(
  (i, pos) => {
    const el = document.querySelectorAll('[data-section-id]')[i];
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - innerHeight + pos * innerHeight);
  },
  index,
  pos,
);
await page.waitForFunction((i) => window.__stage?.scenes[i]?.mode === '3d', { timeout: 60000, polling: 200 }, index);
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: path.join(out, 'frame.png'), type: 'png' });

const res = await page.evaluate(
  (i, names, wide, scale) => {
    const st = window.__stage;
    const sc = st.scenes[i];
    const r = st.renderer;
    // three.js keeps node names without spaces, dots, brackets, colons or slashes (PropertyBinding.sanitizeNodeName)
    const clean = (n) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
    const wanted = new Set(names.map(clean));
    const found = [];
    const all = [];
    const restore = [];
    sc.scene.traverse((o) => {
      if (o.isMesh) all.push(`${o.name}${o.visible ? '' : ' (hidden)'}${o.material?.dissolve ? ` v${o.material.dissolve.visibility.toFixed(2)}` : ''}`);
      if (!o.isMesh || Array.isArray(o.material)) return;
      const m0 = o.material;
      if (!o.visible || (m0.dissolve && m0.dissolve.visibility < 0.5)) return;
      const target = wanted.has(clean(o.name));
      if (target) found.push(o.name);
      const m = m0.clone();
      const tail = target
        ? `#ifdef USE_MAP
            vec2 q = min(floor(fract(vMapUv) * 4096.0), vec2(4095.0));
            vec2 hi = floor(q / 16.0);
            vec2 lo = q - hi * 16.0;
            gl_FragColor = vec4(hi / 255.0, (lo.x * 16.0 + lo.y) / 255.0, 1.0);
          #else
            gl_FragColor = vec4(0.0);
          #endif`
        : 'gl_FragColor = vec4(0.0);';
      m.onBeforeCompile = (sh) => {
        const end = sh.fragmentShader.lastIndexOf('}');
        sh.fragmentShader = `${sh.fragmentShader.slice(0, end)}\n${tail}\n${sh.fragmentShader.slice(end)}`;
      };
      m.customProgramCacheKey = () => `uvpass-${target}-${m0.type}`;
      m.transparent = false;
      m.blending = 0; // NoBlending
      m.depthWrite = true;
      m.toneMapped = false;
      restore.push([o, m0]);
      o.material = m;
    });
    const canvas = r.domElement;
    const W = Math.round(canvas.width * scale);
    const H = Math.round(canvas.height * scale);
    const cam = sc.camera;
    const fov0 = cam.fov;
    if (wide !== 1) {
      cam.fov = (2 * Math.atan(Math.tan((fov0 * Math.PI) / 360) * wide) * 180) / Math.PI;
      cam.updateProjectionMatrix();
    }
    const alpha = r.getClearAlpha(); // the stage clears to black (stage.ts)
    const read = () => {
      const rt = new st.rtA.constructor(W, H, { samples: 0, depthBuffer: true });
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(sc.scene, cam);
      const buf = new Uint8Array(W * H * 4);
      r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      r.setRenderTarget(null);
      r.setClearColor(0x000000, alpha);
      rt.dispose();
      let s = '';
      for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
      return btoa(s);
    };
    // the scene as it is first (linear colours: a render target is not encoded for the screen), then the coordinates
    const swapped = restore.map(([o]) => [o, o.material]);
    for (const [o, m0] of restore) o.material = m0;
    const beauty = wide !== 1 || scale !== 1 ? read() : null;
    for (const [o, m] of swapped) o.material = m;
    const data = read();
    for (const [o, m0] of restore) {
      o.material.dispose();
      o.material = m0;
    }
    const camera = { fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far, matrixWorld: cam.matrixWorld.elements.slice(), projection: cam.projectionMatrix.elements.slice() };
    cam.fov = fov0;
    cam.updateProjectionMatrix();
    return {
      W,
      H,
      found,
      all,
      data,
      beauty,
      camera,
    };
  },
  index,
  meshes,
  wide,
  scale,
);
// WebGL reads bottom row first
const upright = (b64) => {
  const raw = Buffer.from(b64, 'base64');
  const rows = Buffer.alloc(raw.length);
  const stride = res.W * 4;
  for (let y = 0; y < res.H; y++) raw.copy(rows, y * stride, (res.H - 1 - y) * stride, (res.H - y) * stride);
  return rows;
};
const rows = upright(res.data);
await sharp(rows, { raw: { width: res.W, height: res.H, channels: 4 } }).png({ compressionLevel: 6 }).toFile(path.join(out, 'uv.png'));
if (res.beauty) {
  // linear -> sRGB, opaque
  const lut = new Uint8Array(256);
  for (let k = 0; k < 256; k++) {
    const c = k / 255;
    lut[k] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
  }
  const b = upright(res.beauty);
  for (let k = 0; k < b.length; k += 4) {
    b[k] = lut[b[k]];
    b[k + 1] = lut[b[k + 1]];
    b[k + 2] = lut[b[k + 2]];
    b[k + 3] = 255;
  }
  await sharp(b, { raw: { width: res.W, height: res.H, channels: 4 } }).removeAlpha().png({ compressionLevel: 6 }).toFile(path.join(out, 'frame.png'));
}
fs.writeFileSync(path.join(out, 'camera.json'), JSON.stringify({ scene: sceneId, pos, wide, scale, meshes: res.found, width: res.W, height: res.H, ...res.camera }, null, 1));
let hit = 0;
for (let k = 3; k < rows.length; k += 4) hit += rows[k] > 127;
console.log(`${out}: ${res.W}x${res.H}, meshes ${res.found.join(', ') || '(none found)'}, ${hit} pixels on them`);
if (!res.found.length) console.log(`the scene's meshes: ${res.all.join(', ')}`);
await browser.close();
