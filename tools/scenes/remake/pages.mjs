// Screenshots of a chapter's paper (statement, exhibits, gallery, offer) on a computer and a phone.
//   node tools/scenes/remake/pages.mjs <chapter id> [--url http://127.0.0.1:4721/] [--steps 6] [--out folder]
//        [--only d|m] [--vw 1440 --vh 900]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const id = args[0] || 'packaging';
const url = opt('url', 'http://127.0.0.1:4721/');
const steps = Number(opt('steps', 6));
const out = opt('out', 'D:/RAhpel/.work-raphael/v4-shots');
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
for (const [tag, vp] of [['d', { width: Number(opt('vw', 1440)), height: Number(opt('vh', 900)) }], ['m', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  if (opt('only', '') && opt('only', '') !== tag) continue;
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2500));
  const { top, bottom } = await page.evaluate((id) => {
    const p = document.querySelector(`#${id} .paper`) || document.getElementById(id);
    const r = p.getBoundingClientRect();
    return { top: r.top + scrollY, bottom: r.bottom + scrollY };
  }, id);
  for (let i = 0; i < steps; i++) {
    const y = top - vp.height * 0.2 + ((bottom - top) * i) / Math.max(1, steps - 1);
    await page.evaluate(async (y) => {
      const from = scrollY;
      for (let k = 1; k <= 10; k++) {
        scrollTo(0, from + ((y - from) * k) / 10);
        await new Promise((r) => setTimeout(r, 30));
      }
    }, y);
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: path.join(out, `${id}-${tag}${i}.jpg`), type: 'jpeg', quality: 72 });
  }
  await page.close();
}
await browser.close();
console.log(out);
