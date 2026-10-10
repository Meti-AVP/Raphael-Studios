// The studio's own T-shirt as a picture for a 3D model: the atelier's print atlas (src/scripts/tee/print.ts, drawn by
// the site's own code in the dev page: the dyed cotton, its heather, the stitching, the rib collar), with the woven
// "RAPHAEL STUDIOS" label under the back neck, as on the studio's tees (media: neck-labels). Saves a PNG (1024 px).
// Needs the dev server.
//
//   node tools/scenes/remake/tee_atlas.mjs <colour #hex> <out.png> [--url http://127.0.0.1:4721/]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const [colour = '#3c6491', out = 'D:/RAhpel/.work-raphael/v5-art/hero/tee-atlas.png'] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const url = opt('url', 'http://127.0.0.1:4721/');

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage();
await page.goto(`${url}?poster`, { waitUntil: 'load', timeout: 120000 });
const data = await page.evaluate(async (colour) => {
  const { loadTee } = await import('/src/scripts/tee/data.ts');
  const { PrintAtlas } = await import('/src/scripts/tee/print.ts');
  await document.fonts.ready;
  const d = await loadTee('hi');
  const a = new PrintAtlas(d, 1024);
  a.drawBase(colour);
  // the woven label: centred on the back, 2.2 cm under the neckline's lowest point, 6.4 x 1.8 cm, black satin with
  // white capitals and a fine border
  const neck = d.pattern.back.find((s) => s.name === 'neck').pts;
  const low = neck.reduce((m, p) => (Math.abs(p[0]) < Math.abs(m[0]) ? p : m), neck[0]);
  const ctx = a.base.getContext('2d');
  const [cx, cy] = a.px('back', 0, low[1] - 0.022 - 0.009);
  const w = a.len(0.064);
  const h = a.len(0.018);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#111111';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.strokeRect(-w / 2 + h * 0.12, -h / 2 + h * 0.12, w - h * 0.24, h - h * 0.24);
  ctx.fillStyle = '#f4f2ec';
  ctx.font = `700 ${Math.round(h * 0.46)}px "Source Sans 3", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RAPHAEL STUDIOS', 0, h * 0.03);
  ctx.restore();
  return a.base.toDataURL('image/png');
}, colour);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log(out);
await browser.close();
