// The painter's monitor in the Identity scene: the studio's retouching app, drawn into a canvas that is the screen's
// texture. Scrolling through the scene is the work being done on one photograph (progress 0..1):
//   0.00-0.12  the raw photograph opens (flat, cool, a little dark)
//   0.12-0.55  the adjustments move one after another and the picture comes to life; the histogram follows
//   0.55-0.74  the crop: the frame closes in on the subject, the thirds over it
//   0.74-0.92  before / after: a line sweeps across, the raw on one side, the finished on the other
//   0.92-1.00  exported
// The interface is the studio's own (no real application's look): dark panels, the turquoise of the brand.

const W = 768;
const H = 512;
const TOP = 26;
const BOTTOM = 20;
const RAIL = 34;
const PANEL = 196;
const TURQ = '#19b5a8';
const FONT = '"Source Sans 3", "Segoe UI", system-ui, sans-serif';

const SLIDERS: [string, number][] = [
  ['Exposure', 0.34],
  ['Contrast', 0.42],
  ['Highlights', -0.38],
  ['Shadows', 0.46],
  ['Warmth', 0.28],
  ['Saturation', 0.22],
  ['Clarity', 0.3],
];
const TOOLS = ['move', 'crop', 'brush', 'heal', 'type', 'picker'];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

function histogram(data: Uint8ClampedArray, bins = 64): Float32Array {
  const h = new Float32Array(bins);
  for (let i = 0; i < data.length; i += 16) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    h[Math.min(bins - 1, (l / 256) * bins) | 0]++;
  }
  const m = Math.max(...h);
  for (let i = 0; i < bins; i++) h[i] /= m;
  return h;
}

export interface Screen {
  canvas: HTMLCanvasElement;
  ready: Promise<void>;
  draw(progress: number): void;
}

export function createScreen(base: string): Screen {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  let graded: HTMLCanvasElement | null = null;
  let raw: HTMLCanvasElement | null = null;
  let histRaw = new Float32Array(64);
  let histGraded = new Float32Array(64);

  const ready = (async () => {
    const blob = await fetch(`${base}/editor-photo.webp`).then((r) => r.blob());
    const bmp = await createImageBitmap(blob);
    const iw = W - RAIL - PANEL - 36;
    const ih = Math.round((iw * bmp.height) / bmp.width);
    graded = document.createElement('canvas');
    graded.width = iw;
    graded.height = ih;
    const g = graded.getContext('2d')!;
    g.drawImage(bmp, 0, 0, iw, ih);
    const gd = g.getImageData(0, 0, iw, ih);
    histGraded = histogram(gd.data);
    // the "raw" file: what a camera gives before the work (flatter, cooler, greyer, a little under)
    const rd = new ImageData(new Uint8ClampedArray(gd.data), iw, ih);
    const d = rd.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      for (let c = 0; c < 3; c++) {
        let v = l + (d[i + c] - l) * 0.45; // less colour
        v = 40 + v * 0.62; // less contrast, lifted blacks, lower whites
        v += c === 0 ? -6 : c === 2 ? 8 : 0; // a cool cast
        d[i + c] = v * 0.94;
      }
    }
    histRaw = histogram(d);
    raw = document.createElement('canvas');
    raw.width = iw;
    raw.height = ih;
    raw.getContext('2d')!.putImageData(rd, 0, 0);
  })();

  function chrome(p: number) {
    // window
    ctx.fillStyle = '#1c1d20';
    ctx.fillRect(0, 0, W, H);
    // title bar
    ctx.fillStyle = '#2a2b2f';
    ctx.fillRect(0, 0, W, TOP);
    ['#3a3b40', '#3a3b40', TURQ].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(14 + i * 14, TOP / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#c9c7bf';
    ctx.font = `600 11px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Raphael Studio · Retouch', 66, TOP / 2);
    ctx.fillStyle = '#8b8a84';
    ctx.font = `400 11px ${FONT}`;
    ctx.fillText(`cairo-winter.tif  ·  ${Math.round(48 + ease(span(p, 0.55, 0.74)) * 16)}%`, 210, TOP / 2);
    const done = p > 0.92;
    ctx.fillStyle = done ? TURQ : '#3a3b40';
    ctx.beginPath();
    ctx.roundRect(W - 78, 5, 66, 16, 8);
    ctx.fill();
    ctx.fillStyle = done ? '#0b2422' : '#c9c7bf';
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(done ? 'Exported' : 'Export', W - 45, 13.5);
    ctx.textAlign = 'left';
    // tool rail
    ctx.fillStyle = '#232427';
    ctx.fillRect(0, TOP, RAIL, H - TOP - BOTTOM);
    const active = p < 0.12 ? 0 : p < 0.55 ? 5 : p < 0.74 ? 1 : p < 0.92 ? 3 : 0;
    TOOLS.forEach((t, i) => {
      const y = TOP + 16 + i * 30;
      if (i === active) {
        ctx.fillStyle = 'rgba(25,181,168,0.18)';
        ctx.beginPath();
        ctx.roundRect(5, y - 3, RAIL - 10, 24, 5);
        ctx.fill();
      }
      ctx.strokeStyle = i === active ? TURQ : '#9a9890';
      ctx.lineWidth = 1.4;
      icon(t, 17, y + 9);
    });
    // status bar
    ctx.fillStyle = '#232427';
    ctx.fillRect(0, H - BOTTOM, W, BOTTOM);
    ctx.fillStyle = '#8b8a84';
    ctx.font = `400 10px ${FONT}`;
    ctx.fillText('Raphael Studios · Cairo', 10, H - BOTTOM / 2);
    ctx.textAlign = 'right';
    ctx.fillText('1920 × 1280 px · sRGB · 16 bit', W - PANEL - 12, H - BOTTOM / 2);
    ctx.textAlign = 'left';
  }

  function icon(t: string, x: number, y: number) {
    ctx.beginPath();
    switch (t) {
      case 'move':
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        break;
      case 'crop':
        ctx.moveTo(x - 4, y - 7);
        ctx.lineTo(x - 4, y + 4);
        ctx.lineTo(x + 7, y + 4);
        ctx.moveTo(x - 7, y - 4);
        ctx.lineTo(x + 4, y - 4);
        ctx.lineTo(x + 4, y + 7);
        break;
      case 'brush':
        ctx.moveTo(x + 6, y - 6);
        ctx.lineTo(x - 2, y + 2);
        ctx.arc(x - 4, y + 4, 2.5, 0, Math.PI * 2);
        break;
      case 'heal':
        ctx.roundRect(x - 6, y - 3, 12, 6, 3);
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x, y + 2);
        break;
      case 'type':
        ctx.moveTo(x - 5, y - 6);
        ctx.lineTo(x + 5, y - 6);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        break;
      default:
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x, y + 8);
    }
    ctx.stroke();
  }

  function panel(p: number, amount: number) {
    const x0 = W - PANEL;
    ctx.fillStyle = '#26272b';
    ctx.fillRect(x0, TOP, PANEL, H - TOP - BOTTOM);
    ctx.fillStyle = '#c9c7bf';
    ctx.font = `700 10px ${FONT}`;
    ctx.fillText('ADJUSTMENTS', x0 + 14, TOP + 18);
    // histogram, from the raw file's to the finished one's
    const hx = x0 + 14;
    const hy = TOP + 30;
    const hw = PANEL - 28;
    const hh = 54;
    ctx.fillStyle = '#1c1d20';
    ctx.fillRect(hx, hy, hw, hh);
    ctx.beginPath();
    ctx.moveTo(hx, hy + hh);
    for (let i = 0; i < 64; i++) {
      const v = histRaw[i] + (histGraded[i] - histRaw[i]) * amount;
      ctx.lineTo(hx + (i / 63) * hw, hy + hh - v * (hh - 6));
    }
    ctx.lineTo(hx + hw, hy + hh);
    ctx.closePath();
    ctx.fillStyle = 'rgba(25,181,168,0.55)';
    ctx.fill();
    // the sliders, one after another
    SLIDERS.forEach(([name, target], i) => {
      const y = hy + hh + 26 + i * 38;
      const k = ease(span(p, 0.12 + i * 0.055, 0.12 + i * 0.055 + 0.12));
      const v = target * k;
      const live = k > 0 && k < 1;
      ctx.fillStyle = live ? '#f2efe6' : '#a8a69e';
      ctx.font = `600 10.5px ${FONT}`;
      ctx.fillText(name, hx, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = live ? TURQ : '#8b8a84';
      ctx.fillText(`${v >= 0 ? '+' : ''}${v.toFixed(2)}`, hx + hw, y);
      ctx.textAlign = 'left';
      const ty = y + 12;
      ctx.fillStyle = '#3a3b40';
      ctx.fillRect(hx, ty - 1, hw, 2);
      const mid = hx + hw / 2;
      const kx = mid + (v / 1) * (hw / 2);
      ctx.fillStyle = TURQ;
      ctx.fillRect(Math.min(mid, kx), ty - 1, Math.abs(kx - mid), 2);
      ctx.beginPath();
      ctx.arc(kx, ty, live ? 5.5 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f2efe6';
      ctx.fill();
    });
  }

  function picture(p: number, amount: number) {
    if (!graded || !raw) return;
    const areaX = RAIL;
    const areaW = W - RAIL - PANEL;
    const areaY = TOP;
    const areaH = H - TOP - BOTTOM;
    const iw = graded.width;
    const ih = graded.height;
    const x = areaX + (areaW - iw) / 2;
    const y = areaY + (areaH - ih) / 2;
    ctx.drawImage(raw, x, y);
    // the finished picture over the raw one: by the adjustments, then by the before/after line
    const split = ease(span(p, 0.74, 0.9));
    const showing = p < 0.74 ? amount : 1;
    ctx.save();
    if (p >= 0.74 && p < 0.92) {
      const lx = x + iw * (1 - split);
      ctx.beginPath();
      ctx.rect(x, y, lx - x, ih);
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.drawImage(graded, x, y);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#f2efe6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx, y + ih);
      ctx.stroke();
      ctx.fillStyle = '#f2efe6';
      ctx.beginPath();
      ctx.arc(lx, y + ih / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = 'rgba(28,29,32,0.75)';
      ctx.fillRect(x + 8, y + 8, 46, 18);
      ctx.fillRect(x + iw - 54, y + 8, 46, 18);
      ctx.fillStyle = '#f2efe6';
      ctx.fillText('After', x + 16, y + 17);
      ctx.fillText('Before', x + iw - 48, y + 17);
    } else {
      ctx.globalAlpha = showing;
      ctx.drawImage(graded, x, y);
    }
    ctx.restore();
    // the crop
    const c = ease(span(p, 0.55, 0.72));
    if (p >= 0.55 && p < 0.76) {
      const inset = c * 0.09;
      const cx0 = x + iw * inset;
      const cy0 = y + ih * inset * 0.8;
      const cw = iw * (1 - inset * 2);
      const ch = ih * (1 - inset * 1.6);
      ctx.fillStyle = 'rgba(15,16,18,0.55)';
      ctx.fillRect(x, y, iw, cy0 - y);
      ctx.fillRect(x, cy0 + ch, iw, y + ih - cy0 - ch);
      ctx.fillRect(x, cy0, cx0 - x, ch);
      ctx.fillRect(cx0 + cw, cy0, x + iw - cx0 - cw, ch);
      ctx.strokeStyle = 'rgba(242,239,230,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx0 + 0.5, cy0 + 0.5, cw, ch);
      ctx.strokeStyle = 'rgba(242,239,230,0.35)';
      ctx.beginPath();
      for (const f of [1 / 3, 2 / 3]) {
        ctx.moveTo(cx0 + cw * f, cy0);
        ctx.lineTo(cx0 + cw * f, cy0 + ch);
        ctx.moveTo(cx0, cy0 + ch * f);
        ctx.lineTo(cx0 + cw, cy0 + ch * f);
      }
      ctx.stroke();
      ctx.fillStyle = TURQ;
      for (const [hx, hy] of [[cx0, cy0], [cx0 + cw, cy0], [cx0, cy0 + ch], [cx0 + cw, cy0 + ch]]) ctx.fillRect(hx - 3, hy - 3, 6, 6);
    }
    // exported
    if (p > 0.92) {
      const k = ease(span(p, 0.92, 0.98));
      ctx.globalAlpha = k;
      const tw = 236;
      const tx = x + (iw - tw) / 2;
      const ty = y + ih - 40 + (1 - k) * 12;
      ctx.fillStyle = 'rgba(20,21,24,0.92)';
      ctx.beginPath();
      ctx.roundRect(tx, ty, tw, 28, 14);
      ctx.fill();
      ctx.fillStyle = TURQ;
      ctx.beginPath();
      ctx.arc(tx + 16, ty + 14, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0b2422';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx + 12.5, ty + 14);
      ctx.lineTo(tx + 15.5, ty + 17);
      ctx.lineTo(tx + 20, ty + 11);
      ctx.stroke();
      ctx.fillStyle = '#f2efe6';
      ctx.font = `600 11px ${FONT}`;
      ctx.fillText('Exported · cairo-winter_final.jpg', tx + 30, ty + 14.5);
      ctx.globalAlpha = 1;
    }
  }

  return {
    canvas,
    ready,
    draw(p: number) {
      const amount = ease(span(p, 0.12, 0.55));
      ctx.textBaseline = 'middle';
      chrome(p);
      picture(p, amount);
      panel(p, amount);
    },
  };
}
