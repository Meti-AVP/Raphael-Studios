// End-to-end checks of the built site in a real browser (headless Chrome or Edge, with the GPU).
//   npm run verify            (builds first if dist/ is missing; serves it on a free port)
// Prints PASS / FAIL per check and exits 1 if anything failed. Screenshots go to .verify/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const shots = path.join(root, '.verify');
fs.mkdirSync(shots, { recursive: true });
for (const f of fs.readdirSync(shots)) fs.rmSync(path.join(shots, f), { force: true });

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.');
  return found;
}
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.log('dist/ is missing: building first…');
  await new Promise((resolve, reject) => {
    const b = spawn(process.execPath, [path.join(root, 'tools/astro.mjs'), 'build'], { cwd: root, stdio: 'inherit' });
    b.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('build failed'))));
  });
}
const port = await freePort();
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.on('data', (d) => /Serving/.test(String(d)) && resolve()));
const base = `http://127.0.0.1:${port}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  protocolTimeout: 600000,
});

async function openPage(url, { mobile = false, reducedMotion = false } = {}) {
  const page = await browser.newPage();
  if (mobile) {
    await page.emulate({
      viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
  } else await page.setViewport({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const seen = { errors: [], failed: [], external: [] };
  page.on('console', (m) => m.type() === 'error' && seen.errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => seen.errors.push(e.message.slice(0, 200)));
  page.on('requestfailed', (r) => !/^blob:|^data:/.test(r.url()) && seen.failed.push(`${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !/^(data|blob):/.test(u)) seen.external.push(u.slice(0, 100));
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { page, seen };
}
const attr = (page, sel, a) => page.$eval(sel, (el, a) => el.getAttribute(a), a).catch(() => null);
const waitFor = async (page, fn, timeout = 20000, ...args) => {
  try {
    await page.waitForFunction(fn, { timeout, polling: 200 }, ...args);
    return true;
  } catch {
    return false;
  }
};
// how much of a screenshot region is not near-black (the painting is drawn)
async function painted(page, clip) {
  // the visible screen only (a clip outside it would make Chrome re-lay the page out at full height)
  const buf = await page.screenshot({ type: 'png', captureBeyondViewport: false });
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  // decode a PNG enough to sample: use the browser to read it back
  return page.evaluate(async (b64, clip, dpr) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    x.drawImage(img, clip.x * dpr, clip.y * dpr, clip.width * dpr, clip.height * dpr, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    // a painting: not black, and not one flat colour (luminance spread)
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      sum += l;
      sq += l * l;
    }
    const n = 64 * 64;
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    return mean > 18 && sd > 14 ? 1 : 0;
  }, Buffer.from(buf).toString('base64'), clip, dpr);
}
// jump to a section; far chapters are laid out as they come near, so repeat the jump until the page holds still
async function scrollToId(page, id, offset = 0.5) {
  for (let i = 0; i < 5; i++) {
    const moved = await page.evaluate(
      (id, offset) => {
        const el = document.getElementById(id);
        const y = el.getBoundingClientRect().top + window.scrollY + window.innerHeight * offset;
        const d = Math.abs(window.scrollY - y);
        window.scrollTo(0, y);
        return d;
      },
      id,
      offset,
    );
    await wait(700);
    if (moved < 4) break;
  }
}

// ------------------------------------------------------------------------------------------------ computer
{
  const { page, seen } = await openPage(`${base}/`);
  check('title', /Raphael Studios/.test(await page.title()));
  check('one h1', (await page.$$eval('h1', (h) => h.length)) === 1);
  const loaded = await waitFor(page, () => document.querySelector('.sal')?.dataset.loaded === 'true', 25000);
  check('intro: the first scene arrives (frame completes)', loaded);
  const ready = await waitFor(page, () => document.querySelector('.sal')?.dataset.ready === 'true', 8000);
  check('intro: the frame is ready, index and subtitle shown', ready);
  await wait(2500);
  await page.screenshot({ path: path.join(shots, 'd-hero.jpg'), type: 'jpeg', quality: 70 });
  check('hero painting drawn', (await painted(page, { x: 0, y: 0, width: 1440, height: 900 })) > 0.6);
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return ['700 20px Philosopher', '400 20px Philosopher', '20px "Imperial Script"'].map((f) => document.fonts.check(f));
  });
  check('fonts: Philosopher (bold, regular) and Imperial Script', fonts.every(Boolean), fonts.join(','));
  check('index lists the 13 chapters with numerals', (await page.$$eval('.sal__index li', (l) => l.length)) === 13);
  // chapters menu
  await page.click('[data-menu-toggle]');
  const open = await attr(page, '[data-menu-toggle]', 'aria-expanded');
  await page.keyboard.press('Escape');
  const closed = await attr(page, '[data-menu-toggle]', 'aria-expanded');
  check('chapters menu opens and closes (Escape)', open === 'true' && closed === 'false');
  // a few chapters: their scene is drawn behind the title
  for (const id of ['gifts', 'packaging', 'identity', 'outdoor', 'photography', 'partners']) {
    await scrollToId(page, id, 0.15);
    await wait(4500);
    const lit = await painted(page, { x: 300, y: 100, width: 1100, height: 600 });
    await page.screenshot({ path: path.join(shots, `d-${id}.jpg`), type: 'jpeg', quality: 70 });
    check(`chapter ${id}: its painting is drawn`, lit > 0.5);
  }
  // the billboard: type a brand
  await scrollToId(page, 'outdoor', 0.45);
  await wait(1500);
  const live = await waitFor(page, () => document.querySelector('.hill')?.classList.contains('is-live'), 15000);
  if (live) {
    await page.click('#hill-name');
    await page.keyboard.type('Nile Roasters', { delay: 20 });
    await wait(800);
    await page.screenshot({ path: path.join(shots, 'd-billboard.jpg'), type: 'jpeg', quality: 70 });
  }
  check('billboard takes the reader’s brand', live);
  // the showrooms (agua's way): the real pieces in 3D; the bar changes the piece under a panel of its colour
  const room = async (id) => {
    await page.evaluate((id) => document.querySelector(`[data-showroom="${id}"]`).scrollIntoView({ block: 'start' }), id);
    return waitFor(page, (id) => document.querySelector(`[data-showroom="${id}"]`)?.classList.contains('is-ready'), 30000, id);
  };
  for (const id of ['uniform', 'giveaways', 'packaging']) {
    const ok = await room(id);
    if (!ok) {
      check(`showroom ${id}: its first piece is drawn`, false);
      continue;
    }
    await wait(1500);
    const nameOf = () => page.$$eval(`[data-showroom="${id}"] .showroom__line > span`, (l) => l.map((e) => e.textContent).join(' '));
    const name0 = await nameOf();
    await page.click(`[data-showroom="${id}"] [data-showroom-item="1"]`);
    await wait(1700);
    const name1 = await nameOf();
    const ask = await attr(page, `[data-showroom="${id}"] [data-showroom-ask]`, 'href');
    await page.screenshot({ path: path.join(shots, `d-room-${id}.jpg`), type: 'jpeg', quality: 70 });
    check(`showroom ${id}: drawn, and the bar changes the piece`, name0 !== name1 && /wa\.me/.test(ask || ''), `${name0} -> ${name1}`);
  }
  // a chapter's studio opens under its showroom ("Make yours")
  const openStudio = async (id) => {
    if (!(await room(id))) return false;
    await page.evaluate((id) => {
      const r = document.querySelector(`[data-showroom="${id}"]`);
      if (!r.classList.contains('is-making')) r.querySelector('[data-showroom-make]').click();
    }, id);
    await wait(1200);
    return true;
  };
  // the atelier: the shirt is simulated and reacts
  await openStudio('uniform');
  await page.evaluate(() => {
    const el = document.getElementById('atelier');
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
  });
  const teeReady = await waitFor(page, () => document.querySelector('[data-tee]')?.classList.contains('is-ready'), 25000);
  check('atelier: the shirt is sewn and drawn', teeReady);
  if (teeReady) {
    await wait(1500);
    const box = await page.$eval('.tee__canvas', (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const sy = await page.evaluate(() => window.scrollY);
    const clip = { x: Math.round(box.x), y: Math.round(box.y + sy), width: Math.round(box.w), height: Math.round(box.h) };
    const before = await page.screenshot({ type: 'png', clip });
    await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.68);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.w * (0.5 + i * 0.025), box.y + box.h * (0.68 + i * 0.01));
      await wait(30);
    }
    await wait(250);
    const after = await page.screenshot({ type: 'png', clip });
    await page.mouse.up();
    await page.screenshot({ path: path.join(shots, 'd-atelier.jpg'), type: 'jpeg', quality: 70 });
    check('atelier: pulling the fabric moves it', !Buffer.from(before).equals(Buffer.from(after)));
    await page.evaluate(() => {
      const i = document.querySelector('.tee__text');
      i.value = 'Nile Roasters';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const href = await attr(page, '[data-tee-order]', 'href');
    check('atelier: the sample request carries the design', !!href && decodeURIComponent(href).includes('Nile Roasters'));
    // a polo (its collar, placket and buttons ride the cloth), a mark on its back, the spec written out
    const shotStage = () => page.screenshot({ type: 'png', clip, captureBeyondViewport: false });
    const plain = await shotStage();
    await page.click('[data-tee] input[name="garment"][value="polo"]');
    await wait(2500);
    const polo = await shotStage();
    await page.click('[data-tee] [data-tee-step="2"]');
    await page.click('[data-tee] input[name="place"][value="back"]');
    await page.click('[data-tee] input[name="on"]');
    await wait(2500);
    await page.click('[data-tee] [data-tee-step="3"]');
    const spec = await page.$eval('[data-tee-spec]', (u) => u.textContent);
    await page.screenshot({ path: path.join(shots, 'd-atelier-polo.jpg'), type: 'jpeg', quality: 70 });
    check('atelier: a polo, a mark on its back, the spec written', !Buffer.from(plain).equals(Buffer.from(polo)) && /Polo/.test(spec) && /Back:/.test(spec), spec.slice(0, 90));
  }
  // the other studios: each starts when it comes near, answers a hand, and writes its request
  const centre = async (sel) => {
    for (let i = 0; i < 5; i++) {
      const moved = await page.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        const y = r.top + window.scrollY - (window.innerHeight - r.height) / 2;
        const d = Math.abs(window.scrollY - y);
        window.scrollTo(0, y);
        return d;
      }, sel);
      await wait(600);
      if (moved < 4) break;
    }
  };
  const typeInto = (sel, text) =>
    page.evaluate(
      (sel, text) => {
        const i = document.querySelector(sel);
        i.value = text;
        i.dispatchEvent(new Event('input', { bubbles: true }));
      },
      sel,
      text,
    );
  const caption = (sel) => page.$eval(sel, (e) => e.textContent).catch(() => '');
  // packaging: the sheet folds into the box, the lid opens
  await openStudio('packaging');
  await centre('.box .studio__stage');
  const boxReady = await waitFor(page, () => document.querySelector('.box')?.classList.contains('is-ready'), 25000);
  check('packaging: the box is built and drawn', boxReady);
  if (boxReady) {
    const folded = await waitFor(page, () => /Mailer box/.test(document.querySelector('[data-box-caption]')?.textContent || ''), 9000);
    await page.click('[data-box-lid]');
    const opened = await waitFor(page, () => /present/.test(document.querySelector('[data-box-caption]')?.textContent || ''), 4000);
    await wait(900);
    await page.screenshot({ path: path.join(shots, 'd-box.jpg'), type: 'jpeg', quality: 70 });
    check('packaging: the sheet folds into a box and the lid opens', folded && opened, await caption('[data-box-caption]'));
    await typeInto('.box input[name="text"]', 'Nile Roasters');
    await typeInto('.box select[name="size"]', '32 × 22 × 10 cm');
    await wait(300);
    const href = decodeURIComponent((await attr(page, '[data-box-order]', 'href')) || '');
    check('packaging: the request carries the brand, the size and the count', href.includes('Nile Roasters') && href.includes('32 × 22 × 10 cm') && /500 mailer boxes/.test(href));
  }
  // events: the camera hands out a print
  await centre('.booth .studio__stage');
  const boothLive = await waitFor(page, () => document.querySelector('.booth')?.classList.contains('is-live-physics'), 15000);
  if (boothLive) {
    const before = await page.$$eval('.booth .polaroid', (l) => l.length);
    await typeInto('.booth input[name="event"]', 'Nile Roasters Day');
    await page.click('[data-booth-shoot]');
    await wait(2500);
    const after = await page.$$eval('.booth .polaroid', (l) => l.length);
    const printed = await page.$$eval('.booth figcaption', (l) => l.some((f) => f.textContent === 'Nile Roasters Day'));
    await page.screenshot({ path: path.join(shots, 'd-booth.jpg'), type: 'jpeg', quality: 70 });
    check('events: the camera prints the event on a new picture', after === before + 1 && printed, `${before} -> ${after}`);
  } else check('events: the camera prints the event on a new picture', false, 'booth never started');
  // 3D: the line between the drawing and the render moves, by keyboard too
  await centre('.viz .studio__stage');
  const vizReady = await waitFor(page, () => document.querySelector('.viz')?.classList.contains('is-ready'), 25000);
  check('3D: the kiosk is drawn and rendered', vizReady);
  if (vizReady) {
    await wait(3000);
    const v0 = Number(await attr(page, '[data-viz-handle]', 'aria-valuenow'));
    await page.focus('[data-viz-handle]');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await wait(200);
    const v1 = Number(await attr(page, '[data-viz-handle]', 'aria-valuenow'));
    await page.screenshot({ path: path.join(shots, 'd-viz.jpg'), type: 'jpeg', quality: 70 });
    check('3D: the line moves with the keys', v1 < v0, `${v0} -> ${v1}`);
  }
  // giveaways: they rain, pile up and take the brand
  await openStudio('giveaways');
  await centre('.rain .studio__stage');
  const rainReady = await waitFor(page, () => document.querySelector('.rain')?.classList.contains('is-ready'), 25000);
  check('giveaways: the sand is drawn', rainReady);
  if (rainReady) {
    await wait(5000);
    const box = await page.$eval('.rain .studio__stage', (c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const piled = await painted(page, box);
    await page.click('[data-rain-shake]');
    await wait(1200);
    await page.screenshot({ path: path.join(shots, 'd-rain.jpg'), type: 'jpeg', quality: 70 });
    check('giveaways: the things rain and pile up', piled > 0.5);
    await typeInto('.rain input[name="text"]', 'Nile Roasters');
    await page.click('.rain input[name="kind"][value="pen"]');
    await wait(300);
    const href = decodeURIComponent((await attr(page, '[data-rain-order]', 'href')) || '');
    check('giveaways: the request carries the brand and the set', href.includes('Nile Roasters') && href.includes('mug') && !href.includes('pen,'));
  }
  // index link
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(800);
  await page.click('.sal__index a[data-chapter="pos"]');
  await wait(3500);
  const nearPos = await page.evaluate(() => {
    const r = document.getElementById('pos').getBoundingClientRect();
    return { top: Math.round(r.top), y: Math.round(window.scrollY), vh: window.innerHeight };
  });
  check('index link scrolls to its chapter', Math.abs(nearPos.top) < nearPos.vh, JSON.stringify(nearPos));
  // v4's presentation: the statement's pictures, the work ribbon (agua's drag), the tumbler, the shelf, the offer
  check('statements carry their pictures', (await page.$$eval('.statement__pic', (l) => l.length)) >= 13);
  await page.evaluate(() => document.querySelector('.ribbon')?.scrollIntoView({ block: 'center' }));
  await wait(1200);
  const slideX = () => page.$eval('.ribbon [data-ribbon-slide]', (e) => e.style.transform);
  const box = await page.$eval('.ribbon [data-ribbon-track]', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const r0 = await slideX();
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(box.x - k * 30, box.y);
    await wait(16);
  }
  await page.mouse.up();
  await wait(300);
  const r1 = await slideX();
  await wait(1500);
  const r2 = await slideX();
  check('ribbon: a drag moves the pictures and they glide on after it', r0 !== r1 && r1 !== r2, `${r0} -> ${r1} -> ${r2}`);
  await page.focus('.ribbon [data-ribbon-track]');
  await page.keyboard.press('ArrowRight');
  await wait(1500);
  check('ribbon: the arrow key moves it', (await slideX()) !== r2);
  // the tumbler: it rises with the scroll, is drawn, and takes the reader's brand
  await page.evaluate(() => {
    const st = document.querySelector('[data-tumbler-stage]');
    window.scrollTo(0, st.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.8);
  });
  await wait(1200);
  const tReady = await waitFor(page, () => document.querySelector('.tumbler')?.classList.contains('is-ready'), 15000);
  const ph0 = await page.$eval('[data-tumbler-stage]', (e) => e.style.getPropertyValue('--ph'));
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.4));
  await wait(1200);
  const ph1 = await page.$eval('[data-tumbler-stage]', (e) => e.style.getPropertyValue('--ph'));
  check('tumbler: drawn, and it rises with the scroll', tReady && Number(ph1) > Number(ph0), `ready ${tReady}, --ph ${ph0} -> ${ph1}`);
  if (tReady) {
    await page.evaluate(() => document.querySelector('[data-tumbler-jar]').scrollIntoView({ block: 'center' }));
    await wait(1500);
    // (a region shot that may resize the page would clear the canvas, which draws only on change: the region is
    // taken as it is on screen, in the document's coordinates)
    const clip = await page.$eval('.tumbler__canvas', (c) => {
      const r = c.getBoundingClientRect();
      const top = Math.max(0, r.top);
      return { x: r.left + scrollX, y: top + scrollY, width: r.width, height: Math.min(r.bottom, innerHeight) - top };
    });
    await page.screenshot({ path: path.join(shots, 'd-tumbler.jpg'), type: 'jpeg', quality: 70 });
    const before = await page.screenshot({ clip, type: 'png', captureBeyondViewport: false });
    await page.$eval('[data-tumbler-brand]', (el) => {
      el.value = 'Nile Roasters';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await wait(1000);
    const after = await page.screenshot({ clip, type: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(shots, 'd-tumbler-a.png'), before);
    fs.writeFileSync(path.join(shots, 'd-tumbler-b.png'), after);
    check('tumbler: the wrap is printed with the brand', !Buffer.from(before).equals(Buffer.from(after)), JSON.stringify(clip));
  }
  // the shelf: a card fills with its chapter's letters under the pointer; a drag moves the shelf
  await page.evaluate(() => document.querySelector('.shelf')?.scrollIntoView({ block: 'center' }));
  await wait(2500);
  check('shelf: a card for each chapter', (await page.$$eval('.shelf [data-shelf-card]', (l) => l.length)) === 13);
  const card = await page.$eval('.shelf [data-shelf-card]', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(5, 5);
  await page.mouse.move(card.x, card.y, { steps: 6 });
  await wait(900);
  check('shelf: the letters fall into the card', (await page.$$eval('.shelf__letter', (l) => l.length)) > 3);
  const sl0 = await page.$eval('[data-shelf-track]', (e) => e.scrollLeft);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(card.x - k * 30, card.y);
    await wait(16);
  }
  await page.mouse.up();
  await wait(1200);
  const sl1 = await page.$eval('[data-shelf-track]', (e) => e.scrollLeft);
  check('shelf: a drag moves it', sl1 > sl0, `${sl0} -> ${sl1}`);
  await page.evaluate(() => document.querySelector('.wall')?.scrollIntoView({ block: 'center' }));
  const wallIn = await waitFor(page, () => document.querySelector('.wall')?.classList.contains('is-in'), 6000);
  const brandsOnWall = await page.$$eval('.wall__logo', (l) => l.length);
  await wait(1200);
  await page.screenshot({ path: path.join(shots, 'd-wall.jpg'), type: 'jpeg', quality: 70 });
  check('partners: the wall of gold fills as it comes in', wallIn && brandsOnWall >= 30, `${brandsOnWall} brands`);
  check('offer lists the services', (await page.$$eval('.offer__row', (l) => l.length)) >= 13);
  const foot = await page.$eval('#contact', (f) => !!f.querySelector('a[href^="https://wa.me/"]'));
  check('footer: the contact and its WhatsApp link', foot);
  // pictures and links
  const imgs = await page.$$eval('img', (l) => l.map((i) => ({ alt: i.getAttribute('alt'), hidden: i.getAttribute('aria-hidden') })));
  check('every picture has an alt', imgs.every((i) => i.alt !== null), `${imgs.length} pictures`);
  const blank = await page.$$eval('a[target="_blank"]', (l) => l.filter((a) => !/noopener/.test(a.rel)).length);
  check('new-tab links are noopener', blank === 0);
  check('no console errors', seen.errors.length === 0, seen.errors.slice(0, 3).join(' | '));
  check('no failed requests', seen.failed.length === 0, seen.failed.slice(0, 3).join(' | '));
  check('no requests to other hosts', seen.external.length === 0, seen.external.slice(0, 3).join(' | '));
  await page.close();
}

// ------------------------------------------------------------------------------------------------ phone
{
  const { page, seen } = await openPage(`${base}/`, { mobile: true });
  const ready = await waitFor(page, () => document.querySelector('.sal')?.dataset.ready === 'true', 20000);
  check('phone: intro completes (still painting)', ready);
  await wait(1500);
  await page.screenshot({ path: path.join(shots, 'm-hero.jpg'), type: 'jpeg', quality: 70 });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('phone: no sideways scrolling', wide <= 1, `${wide}px`);
  const frame = await page.$eval('.sal__frame', (f) => {
    const r = f.getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth;
  });
  check('phone: the title frame fits the screen', frame);
  await scrollToId(page, 'uniform', 0.1);
  await wait(3000);
  await page.screenshot({ path: path.join(shots, 'm-uniform.jpg'), type: 'jpeg', quality: 70 });
  check('phone: chapter painting drawn', (await painted(page, { x: 0, y: 100, width: 390, height: 600 })) > 0.5);
  check('phone: no console errors', seen.errors.length === 0, seen.errors.slice(0, 3).join(' | '));
  check('phone: no failed requests', seen.failed.length === 0, seen.failed.slice(0, 3).join(' | '));
  await page.close();
}

// ------------------------------------------------------------------------------------------------ reduced motion, 404
{
  const { page, seen } = await openPage(`${base}/`, { reducedMotion: true });
  await wait(1500);
  const linesHidden = await page.$eval('.sal__lines', (s) => getComputedStyle(s).display === 'none');
  check('reduced motion: no line drawing', linesHidden);
  check('reduced motion: no console errors', seen.errors.length === 0, seen.errors.slice(0, 3).join(' | '));
  await page.close();
}
{
  const { page } = await openPage(`${base}/no-such-page/`);
  const text = await page.$eval('h1', (h) => h.textContent);
  check('404 page', /not painted yet/i.test(text || ''));
  await page.close();
}
for (const [url, title] of [['/privacy/', 'Privacy'], ['/credits/', 'Credits & licences']]) {
  const { page, seen } = await openPage(`${base}${url}`);
  const h1 = await page.$eval('h1', (h) => h.textContent.trim());
  check(`${url}: the page and its title`, h1 === title && seen.errors.length === 0, h1);
  await page.close();
}

await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
