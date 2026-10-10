// How a remade scene looks in the site: the dev page in its ?poster mode (3D, nothing over the painting), one
// screenshot per scene, for review. Needs the dev server running.
//
//   node tools/scenes/remake/look.mjs [--url http://127.0.0.1:4721/] [--only hero,gifts] [--out folder] [--phone]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const url = opt('url', 'http://127.0.0.1:4721/');
const only = opt('only', null)?.split(',') ?? null;
const out = opt('out', 'D:/RAhpel/.work-raphael/v4-art/_looks');
const phone = args.includes('--phone');
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  protocolTimeout: 900000,
});
const page = await browser.newPage();
await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}?poster`, { waitUntil: 'load', timeout: 180000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForFunction(() => window.__stage, { timeout: 120000, polling: 250 });
const ids = await page.evaluate(() => [...document.querySelectorAll('[data-section-id]')].map((s) => s.dataset.scene));
for (const [i, sceneId] of ids.entries()) {
  if (!sceneId || (only && !only.includes(sceneId))) continue;
  await page.evaluate((i) => {
    const el = document.querySelectorAll('[data-section-id]')[i];
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, i === 0 ? 0 : top + window.innerHeight * 0.5);
  }, i);
  try {
    await page.waitForFunction((i) => window.__stage?.scenes[i]?.mode === '3d', { timeout: 60000, polling: 200 }, i);
  } catch {
    console.log(`${sceneId}: no 3D (still painting)`);
  }
  await new Promise((r) => setTimeout(r, 2500));
  const file = path.join(out, `${sceneId}${phone ? '-m' : ''}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
  console.log(file);
}
if (errors.length) console.log('errors:', errors.slice(0, 3).join(' | '));
await browser.close();
