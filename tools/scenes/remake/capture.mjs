// A scene's frame as its camera sees it, for painting something new into it (relief.py): the dev page in ?poster mode
// scrolled to a timeline position, a screenshot of the 3D (nothing over it), the camera's matrices, and where on the
// screen some named objects are (their bounding boxes, projected). Needs the dev server.
//
//   node tools/scenes/remake/capture.mjs <scene> <position> [--objects "Box Opening,Shopping Stand"] [--out dir]
//        [--hide "Name,Name"] [--url http://127.0.0.1:4721/]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const [sceneId, posArg] = args;
const pos = Number(posArg);
const url = opt('url', 'http://127.0.0.1:4721/');
const out = opt('out', `D:/RAhpel/.work-raphael/v4-art/${sceneId}/capture`);
const objects = (opt('objects', '') || '').split(',').filter(Boolean);
const hide = (opt('hide', '') || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: Number(opt('dpr', 1.3334)) });
await page.goto(`${url}?poster`, { waitUntil: 'load', timeout: 180000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForFunction(() => window.__stage, { timeout: 120000, polling: 250 });
const index = await page.evaluate((id) => [...document.querySelectorAll('[data-section-id]')].findIndex((s) => s.dataset.scene === id), sceneId);
// pos = (scrollY + vh - top) / vh
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
await page.evaluate(
  (i, hide) => {
    const s = window.__stage.scenes[i].scene;
    for (const n of hide) {
      const o = s.getObjectByName(n);
      if (o) o.visible = false;
    }
  },
  index,
  hide,
);
await new Promise((r) => setTimeout(r, 2500));
const info = await page.evaluate(
  (i, names) => {
    const sc = window.__stage.scenes[i];
    const cam = sc.camera;
    cam.updateMatrixWorld();
    const mul = (m, v) => {
      const e = m.elements;
      const x = v[0], y = v[1], z = v[2], w = v[3] ?? 1;
      return [
        e[0] * x + e[4] * y + e[8] * z + e[12] * w,
        e[1] * x + e[5] * y + e[9] * z + e[13] * w,
        e[2] * x + e[6] * y + e[10] * z + e[14] * w,
        e[3] * x + e[7] * y + e[11] * z + e[15] * w,
      ];
    };
    const project = (p) => {
      const v = mul(cam.projectionMatrix, mul(cam.matrixWorldInverse, [...p, 1]));
      return [(v[0] / v[3] + 1) / 2, (1 - v[1] / v[3]) / 2, -mul(cam.matrixWorldInverse, [...p, 1])[2]];
    };
    const boxes = {};
    for (const name of names) {
      const o = sc.scene.getObjectByName(name);
      if (!o) continue;
      const pts = [];
      o.updateWorldMatrix(true, true);
      o.traverse((m) => {
        if (!m.isMesh || !m.visible) return;
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
          const w = mul(m.matrixWorld, [x, y, z, 1]);
          pts.push({ world: w.slice(0, 3), screen: project(w.slice(0, 3)) });
        }
      });
      boxes[name] = pts;
    }
    return {
      position: sc.timeline ? undefined : undefined,
      fov: cam.fov,
      aspect: cam.aspect,
      near: cam.near,
      far: cam.far,
      matrixWorld: cam.matrixWorld.elements.slice(),
      projection: cam.projectionMatrix.elements.slice(),
      boxes,
    };
  },
  index,
  objects,
);
info.pos = pos;
info.scene = sceneId;
await page.screenshot({ path: path.join(out, 'frame.png'), type: 'png' });
fs.writeFileSync(path.join(out, 'camera.json'), JSON.stringify(info, null, 1));
console.log(path.join(out, 'frame.png'), `fov ${info.fov} aspect ${info.aspect.toFixed(3)}`, Object.keys(info.boxes).join(','));
await browser.close();
