// The garments of the showroom as pictures for their 3D models: each one's cloth drawn by the atelier's own code (the
// print atlas of src/scripts/tee/print.ts: the dyed cotton, its heather, the stitching, the rib collar) in the dev page,
// then what the studio put on it for the client: logos (tinted to the thread or ink they were made in, at their real
// places and sizes), a woven label, a printed graphic. Saves D:/RAhpel/.work-raphael/v5-art/products/<id>-atlas.png.
// Needs the dev server.
//
//   node tools/scenes/remake/garment_atlas.mjs [--url http://127.0.0.1:4721/]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:4721/';
const OUT = 'D:/RAhpel/.work-raphael/v5-art/products';
fs.mkdirSync(OUT, { recursive: true });

// what each garment carries (spots in the pattern's metres: x across the piece, the wearer's left is +x; y up from the hem)
export const GARMENTS = {
  // MPG (Misr Pyramids Group): its baristas' black polo, the logo embroidered in white on the left chest and large
  // across the back
  'mpg-polo': {
    colour: '#18181a',
    prints: [
      { logo: 'mpg', ink: '#f2f0ea', piece: 'front', x: 0.1, y: 0.53, w: 0.095, technique: 'embroidery' },
      { logo: 'mpg', ink: '#f2f0ea', piece: 'back', x: 0, y: 0.5, w: 0.24, technique: 'print' },
    ],
  },
  // TotalEnergies: the royal blue polo with the brand's colour wave down one side, the logo in white on the chest
  'total-polo': {
    colour: '#1f4fc1',
    wave: true,
    prints: [{ logo: 'totalenergies', ink: '#ffffff', piece: 'front', x: -0.1, y: 0.53, w: 0.085, technique: 'embroidery' }],
  },
  // Orange: the semi-formal sweatshirt, orange, "orange" in white on the left chest
  'orange-sweat': {
    colour: '#ff7a00',
    prints: [{ text: 'orange', ink: '#ffffff', piece: 'front', x: 0.1, y: 0.52, w: 0.1, technique: 'print' }],
  },
  // the studio's own tees, with their woven neck label
  'raphael-tee': { colour: '#b9433a', label: true, prints: [] },
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage();
await page.goto(`${url}?poster`, { waitUntil: 'load', timeout: 120000 });
for (const [id, g] of Object.entries(GARMENTS)) {
  const data = await page.evaluate(async (g) => {
    const { loadTee } = await import('/src/scripts/tee/data.ts');
    const { PrintAtlas } = await import('/src/scripts/tee/print.ts');
    await document.fonts.ready;
    const d = await loadTee('hi');
    const a = new PrintAtlas(d, 2048);
    a.drawBase(g.colour);
    const ctx = a.base.getContext('2d');
    // the colour wave (TotalEnergies): a sweep of the brand's colours from the right hem up across the side
    if (g.wave) {
      for (const piece of ['front', 'back']) {
        const flip = piece === 'back' ? -1 : 1;
        const bands = ['#ffd300', '#ff9e1b', '#ea2a3a', '#a01a7d', '#00a3e0'];
        bands.forEach((c, i) => {
          ctx.beginPath();
          const p0 = a.px(piece, flip * -0.27, 0.02 + i * 0.035);
          const p1 = a.px(piece, flip * -0.05, 0.2 + i * 0.03);
          const p2 = a.px(piece, flip * -0.2, 0.42 + i * 0.02);
          const p3 = a.px(piece, flip * -0.27, 0.55 + i * 0.012);
          ctx.moveTo(...p0);
          ctx.bezierCurveTo(...p1, ...p2, ...p3);
          ctx.strokeStyle = c;
          ctx.lineWidth = a.len(0.03);
          ctx.lineCap = 'round';
          ctx.stroke();
        });
      }
    }
    const logo = async (name) => {
      const img = new Image();
      img.src = `/src/assets/logos/${name}.png`;
      await img.decode();
      return img;
    };
    for (const p of g.prints) {
      const [cx, cy] = a.px(p.piece, p.x, p.y);
      const w = a.len(p.w);
      const art = document.createElement('canvas');
      art.width = Math.ceil(w);
      art.height = Math.ceil(w);
      const c = art.getContext('2d');
      if (p.logo) {
        const im = await logo(p.logo);
        const k = Math.min(art.width / im.width, art.height / im.height) * 0.94;
        c.drawImage(im, (art.width - im.width * k) / 2, (art.height - im.height * k) / 2, im.width * k, im.height * k);
        // tinted to the thread or the ink (the logos are drawn in one colour)
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = p.ink;
        c.fillRect(0, 0, art.width, art.height);
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = p.ink;
        c.font = `700 ${Math.round(art.width * 0.3)}px "Source Sans 3", Arial, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(p.text, art.width / 2, art.height / 2);
      }
      if (p.technique === 'embroidery') {
        const id = c.getImageData(0, 0, art.width, art.height);
        const q = id.data;
        for (let y = 0; y < art.height; y++)
          for (let x = 0; x < art.width; x++) {
            const i = (y * art.width + x) * 4;
            if (q[i + 3] < 10) continue;
            const lift = 0.8 + (((x + y) % 4) / 3) * 0.32;
            q[i] = Math.min(255, q[i] * lift);
            q[i + 1] = Math.min(255, q[i + 1] * lift);
            q[i + 2] = Math.min(255, q[i + 2] * lift);
          }
        c.putImageData(id, 0, 0);
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(p.piece === 'back' ? -1 : 1, 1); // the back panel's u runs the other way: art reads right from behind
      ctx.drawImage(art, -art.width / 2, -art.height / 2);
      ctx.restore();
    }
    if (g.label) {
      const neck = d.pattern.back.find((s) => s.name === 'neck').pts;
      const low = neck.reduce((m, p) => (Math.abs(p[0]) < Math.abs(m[0]) ? p : m), neck[0]);
      const [lx, ly] = a.px('back', 0, low[1] - 0.031);
      const w = a.len(0.064);
      const h = a.len(0.018);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.fillStyle = '#111111';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#f4f2ec';
      ctx.font = `700 ${Math.round(h * 0.46)}px "Source Sans 3", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RAPHAEL STUDIOS', 0, h * 0.03);
      ctx.restore();
    }
    return a.base.toDataURL('image/png');
  }, g);
  fs.writeFileSync(`${OUT}/${id}-atlas.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${id}-atlas.png`);
}
await browser.close();
