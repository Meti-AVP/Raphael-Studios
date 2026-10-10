// Renders the stills of the painted scenes from the scenes themselves (so every rebrand shows in them too):
// the page in its dev-only ?poster mode (3D everywhere, nothing drawn over the painting), one screenshot per scene,
// on a computer screen and on a phone. Needs `npm run dev` running.
//
//   node tools/scenes/posters.mjs [--url http://127.0.0.1:4721/] [--only hero,gifts]
//
// Writes public/scenes/<id>/poster-d.avif (1920 x 1200) and poster-m.avif (804 x 1748), and their sizes in scene.json,
// and keeps a copy in art/posters/<id>-d.avif / -m.avif, which tools/scenes/build.mjs copies on every build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const url = opt('url', 'http://127.0.0.1:4721/');
const only = opt('only', null)?.split(',') ?? null;
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// the phone still is a tall slice of a large render, centred on the scene's subject (the scenes are composed wide)
const focus = {
  hero: 0.72, solutions: 0.17, gifts: 0.58, packaging: 0.45, uniform: 0.42, production: 0.5, giveaways: 0.55,
  pos: 0.5, identity: 0.66, communication: 0.6, visualization: 0.7, outdoor: 0.74, events: 0.5, photography: 0.66,
  partners: 0.79,
};
const variants = [
  { key: 'd', file: 'poster-d.avif', viewport: { width: 1440, height: 900, deviceScaleFactor: 1.3334 } },
  { key: 'm', file: 'poster-m.avif', viewport: { width: 1200, height: 900, deviceScaleFactor: 2 }, crop: { w: 804, h: 1748 } },
];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  protocolTimeout: 900000,
});
for (const v of variants) {
  const page = await browser.newPage();
  await page.setViewport(v.viewport);
  await page.goto(`${url}?poster`, { waitUntil: 'load', timeout: 180000 });
  // the dev server may reload the page once while it optimises dependencies: wait for the stage to be there
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForFunction(() => window.__stage, { timeout: 120000, polling: 250 });
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-section-id]')].map((s) => s.dataset.sectionId));
  for (const [i, id] of ids.entries()) {
    const sceneId = await page.evaluate((i) => document.querySelectorAll('[data-section-id]')[i].dataset.scene, i);
    if (!sceneId || (only && !only.includes(sceneId))) continue;
    const has3d = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/scenes', sceneId, 'scene.json'), 'utf8')).assets.length > 0;
    if (!has3d) continue; // a still painting already
    await page.evaluate((i) => {
      const el = document.querySelectorAll('[data-section-id]')[i];
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, i === 0 ? 0 : top + window.innerHeight * 0.5);
    }, i);
    // wait for the scene's models, then for their burn-in to finish
    await page.waitForFunction((i) => window.__stage?.scenes[i]?.mode === '3d', { timeout: 120000, polling: 200 }, i);
    // (the hero plays its 5 s intro first: its still is where it comes to rest, the work spilled out of the bag)
    await new Promise((r) => setTimeout(r, i === 0 ? 7000 : 2500));
    const shot = await page.screenshot({ type: 'png' });
    const dst = path.join(ROOT, 'public/scenes', sceneId, v.file);
    let img = sharp(shot).removeAlpha();
    if (v.crop) {
      const { width, height } = await img.metadata();
      const cw = Math.round((height * v.crop.w) / v.crop.h);
      const left = Math.max(0, Math.min(width - cw, Math.round(width * (focus[sceneId] ?? 0.5) - cw / 2)));
      img = sharp(await img.extract({ left, top: 0, width: cw, height }).resize(v.crop.w, v.crop.h).png().toBuffer());
    }
    const meta = await img.metadata();
    await img.avif({ quality: 52, effort: 6 }).toFile(dst);
    // kept with the sources too, so the next scene build copies it instead of a placeholder
    fs.mkdirSync(path.join(ROOT, 'art/posters'), { recursive: true });
    fs.copyFileSync(dst, path.join(ROOT, 'art/posters', `${sceneId}-${v.key}.avif`));
    const manifestPath = path.join(ROOT, 'public/scenes', sceneId, 'scene.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.posters[v.key === 'd' ? 'desktop' : 'mobile'] = { url: v.file, width: meta.width, height: meta.height };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    console.log(`${sceneId} ${v.key}: ${meta.width}x${meta.height}, ${(fs.statSync(dst).size / 1024).toFixed(0)} KB`);
  }
  await page.close();
}
await browser.close();
