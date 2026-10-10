// The share image (public/og.jpg, 1200 x 630): the hero as it looks once the intro has played, without the top bar.
// Taken from the built site, so it always matches it. Needs the site built and served (npm run build, npm start).
//
//   node tools/og.mjs [--url http://127.0.0.1:4700/]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:4700/';
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});
const page = await browser.newPage();
// drawn at twice the size and reduced: smoother type and edges
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.addStyleTag({ content: '[data-bar], .skip-link { display: none !important; }' });
await page.waitForFunction(() => document.querySelector('.sal')?.dataset.ready === 'true', { timeout: 60000, polling: 200 });
// the hero's figures settle over the 5 s intro
await new Promise((r) => setTimeout(r, 7000));
const shot = await page.screenshot({ type: 'png' });
await browser.close();

const out = path.join(ROOT, 'public', 'og.jpg');
await sharp(shot).resize(1200, 630, { kernel: 'lanczos3' }).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
console.log(`wrote ${path.relative(ROOT, out)}`);
