// The box's print: the board's two faces as four canvases laid out panel by panel (an atlas), drawn the way the
// sheet would be printed, each panel upright as it reads on the finished box.
//   outside: colour, the finish (roughness in G, foil metal in B), the relief (emboss and the board's texture)
//   inside:  colour (a one-colour pattern, and the message under the lid)
import { panels, type Panel } from './dieline';
import { fitSize } from '../core/canvas-text';

export type FinishId = 'kraft' | 'black' | 'turquoise' | 'white';

export interface Finish {
  name: string;
  /** outside: board colour, ink, how rough each is (0..1), and whether the ink is a metal foil */
  board: string;
  ink: string;
  boardRough: number;
  inkRough: number;
  foil: boolean;
  kraftFibres: boolean;
  clearcoat: number;
  sheen: number;
  technique: string;
  /** inside: the board's other face and its print */
  inside: string;
  insideInk: string;
  /** the board's cut edge */
  edge: string;
  /** tissue paper packed inside */
  tissue: string;
  sticker: string;
  stickerInk: string;
}

export const FINISHES: Record<FinishId, Finish> = {
  kraft: {
    name: 'Natural kraft',
    board: '#a47c4f',
    ink: '#2b2721',
    boardRough: 0.9,
    inkRough: 0.62,
    foil: false,
    kraftFibres: true,
    clearcoat: 0,
    sheen: 0,
    technique: 'one-colour print',
    inside: '#ad885b',
    insideInk: '#0c6e66',
    edge: '#b08d60',
    tissue: '#0e877d',
    sticker: '#0c6e66',
    stickerInk: '#f7f5ee',
  },
  black: {
    name: 'Matte black, gold foil',
    board: '#1d1d1b',
    ink: '#d9b25c',
    boardRough: 0.82,
    inkRough: 0.24,
    foil: true,
    kraftFibres: false,
    clearcoat: 0,
    sheen: 0.15,
    technique: 'gold hot foil',
    inside: '#19b5a8',
    insideInk: '#0c6e66',
    edge: '#3b3127',
    tissue: '#121211',
    sticker: '#d9b25c',
    stickerInk: '#1d1d1b',
  },
  turquoise: {
    name: 'Raphael turquoise, soft touch',
    board: '#19b5a8',
    ink: '#f7f5ee',
    boardRough: 0.74,
    inkRough: 0.55,
    foil: false,
    kraftFibres: false,
    clearcoat: 0,
    sheen: 0.45,
    technique: 'white print on soft-touch lamination',
    inside: '#f2efe6',
    insideInk: '#19b5a8',
    edge: '#c3a171',
    tissue: '#f2efe6',
    sticker: '#f7f5ee',
    stickerInk: '#0c6e66',
  },
  white: {
    name: 'White gloss',
    board: '#f3f1ea',
    ink: '#0c6e66',
    boardRough: 0.4,
    inkRough: 0.3,
    foil: false,
    kraftFibres: false,
    clearcoat: 0.75,
    sheen: 0,
    technique: 'print with gloss varnish',
    inside: '#0c6e66',
    insideInk: '#f7f5ee',
    edge: '#efebe2',
    tissue: '#2cc4b6',
    sticker: '#0c6e66',
    stickerInk: '#f7f5ee',
  },
};

export interface BoxDesign {
  finish: FinishId;
  text: string;
  /** the reader's logo as an ink mask (white where the ink goes) */
  logo: HTMLCanvasElement | null;
}

export interface Slot {
  /** where the panel sits in the canvas (px) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** the panel's print frame: projections of its outline on the reading directions (metres) */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

type Face = 'out' | 'in';

/** the panel's extent along its reading directions */
function frame(p: Panel, face: Face) {
  const { u, v } = p[face];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of p.outline) {
    const pu = x * u[0] + z * u[1];
    const pv = x * v[0] + z * v[1];
    u0 = Math.min(u0, pu);
    u1 = Math.max(u1, pu);
    v0 = Math.min(v0, pv);
    v1 = Math.max(v1, pv);
  }
  return { u0, u1, v0, v1 };
}

// the faces nobody looks at closely are printed at half the resolution
const minor = (id: string, face: Face) => /ear|flap|tuck/.test(id) || (face === 'out' && id === 'base');

/** shelf packing at the largest scale that fits the canvas */
function pack(face: Face, cw: number, ch: number): Map<string, Slot> {
  const items = panels.map((p) => {
    const f = frame(p, face);
    return { id: p.id, f, mw: f.u1 - f.u0, mh: f.v1 - f.v0, k: minor(p.id, face) ? 0.5 : 1 };
  });
  const tryScale = (s: number) => {
    const out = new Map<string, Slot>();
    const sorted = [...items].sort((a, b) => b.mh * b.k - a.mh * a.k);
    let x = 0, y = 0, row = 0;
    const pad = 4;
    for (const it of sorted) {
      const w = Math.ceil(it.mw * s * it.k);
      const h = Math.ceil(it.mh * s * it.k);
      if (x + w > cw) {
        x = 0;
        y += row + pad;
        row = 0;
      }
      if (w > cw || y + h > ch) return null;
      out.set(it.id, { x, y, w, h, ...it.f });
      x += w + pad;
      row = Math.max(row, h);
    }
    return out;
  };
  let lo = 100, hi = 20000;
  let best = tryScale(lo)!;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const r = tryScale(mid);
    if (r) {
      best = r;
      lo = mid;
    } else hi = mid;
  }
  return best;
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** a reproducible random sequence (the board's texture is the same every time it is drawn) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISPLAY = '700 {s}px Philosopher, Georgia, serif';
const SCRIPT = '400 {s}px "Imperial Script", cursive';
const SANS = '600 {s}px "Source Sans 3", Arial, sans-serif';
const font = (f: string, s: number) => f.replace('{s}', String(Math.max(1, Math.round(s))));

export class BoxPrint {
  readonly outColour: HTMLCanvasElement;
  readonly outFinish: HTMLCanvasElement;
  readonly outRelief: HTMLCanvasElement;
  readonly inColour: HTMLCanvasElement;
  readonly sticker: HTMLCanvasElement;
  readonly outSlots: Map<string, Slot>;
  readonly inSlots: Map<string, Slot>;
  private grain: HTMLCanvasElement;

  constructor(size: number) {
    // outside: wide atlas; inside: the same
    this.outColour = canvas(size, size / 2);
    this.outFinish = canvas(size, size / 2);
    this.outRelief = canvas(size, size / 2);
    this.inColour = canvas(size, size / 2);
    this.sticker = canvas(256, 256);
    this.outSlots = pack('out', size, size / 2);
    this.inSlots = pack('in', size, size / 2);
    // the board's grain: a tile of fibres and specks, used for the colour and the relief
    this.grain = canvas(256, 256);
    const g = this.grain.getContext('2d')!;
    const r = rng(2011);
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const x = r() * 256, y = r() * 256, l = 2 + r() * 9, a = r() * Math.PI;
      const v = r() < 0.5 ? 70 + r() * 40 : 150 + r() * 50;
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.globalAlpha = 0.18 + r() * 0.3;
      g.lineWidth = 0.6 + r() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /** UVs of a point of the sheet (flat x, z) on one face of a panel */
  uv(p: Panel, face: Face, x: number, z: number): [number, number] {
    const slot = (face === 'out' ? this.outSlots : this.inSlots).get(p.id)!;
    const { u, v } = p[face];
    const c = face === 'out' ? this.outColour : this.inColour;
    const pu = (x * u[0] + z * u[1] - slot.u0) / (slot.u1 - slot.u0);
    const pv = (x * v[0] + z * v[1] - slot.v0) / (slot.v1 - slot.v0);
    // the canvas's top row is v = 1 (textures are flipped on upload)
    return [(slot.x + pu * slot.w) / c.width, 1 - (slot.y + (1 - pv) * slot.h) / c.height];
  }

  draw(d: BoxDesign) {
    const f = FINISHES[d.finish];
    const name = d.text.trim() || 'Your brand';
    const col = this.outColour.getContext('2d')!;
    const fin = this.outFinish.getContext('2d')!;
    const rel = this.outRelief.getContext('2d')!;
    const ins = this.inColour.getContext('2d')!;
    // outside: board everywhere
    col.fillStyle = f.board;
    col.fillRect(0, 0, this.outColour.width, this.outColour.height);
    // R = 1 (no occlusion), G = roughness, B = metal
    fin.fillStyle = `rgb(255,${Math.round(f.boardRough * 255)},0)`;
    fin.fillRect(0, 0, this.outFinish.width, this.outFinish.height);
    rel.fillStyle = '#808080';
    rel.fillRect(0, 0, this.outRelief.width, this.outRelief.height);
    // the board's texture: kraft shows its fibres in colour; every board has them in the relief
    const pat = (ctx: CanvasRenderingContext2D) => ctx.createPattern(this.grain, 'repeat')!;
    rel.globalAlpha = f.kraftFibres ? 0.9 : 0.35;
    rel.fillStyle = pat(rel);
    rel.fillRect(0, 0, this.outRelief.width, this.outRelief.height);
    rel.globalAlpha = 1;
    if (f.kraftFibres) {
      col.globalCompositeOperation = 'overlay';
      col.globalAlpha = 0.55;
      col.fillStyle = pat(col);
      col.fillRect(0, 0, this.outColour.width, this.outColour.height);
      col.globalCompositeOperation = 'source-over';
      col.globalAlpha = 1;
    }

    // ink, panel by panel (each slot upright, in its own metres-to-pixels scale), drawn straight into the three
    // outside canvases in turn: the ink's colour, its finish, its relief (an emboss)
    const tinted = new Map<string, HTMLCanvasElement>();
    const logoIn = (colour: string) => {
      if (!d.logo) return null;
      if (!tinted.has(colour)) tinted.set(colour, tint(d.logo, colour));
      return tinted.get(colour)!;
    };
    const ink = (slotId: string, paint: (ctx: CanvasRenderingContext2D, w: number, h: number, colour: string) => void) => {
      const s = this.outSlots.get(slotId);
      if (!s) return;
      const into = (ctx: CanvasRenderingContext2D, colour: string, alpha: number) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(s.x, s.y, s.w, s.h);
        ctx.clip();
        ctx.translate(s.x, s.y);
        ctx.globalAlpha = alpha;
        paint(ctx, s.w, s.h, colour);
        ctx.restore();
      };
      into(col, f.ink, 1);
      into(fin, `rgb(255,${Math.round(f.inkRough * 255)},${f.foil ? 255 : 0})`, 1);
      into(rel, f.foil ? '#5a5a5a' : '#c8c8c8', f.foil ? 0.55 : 0.4);
    };
    // the lid: the mark, large
    ink('lid', (l, w, h, c) => {
      const pad = Math.min(w, h) * 0.06;
      l.strokeStyle = c;
      l.lineWidth = Math.max(1.5, w * 0.004);
      l.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
      const logo = logoIn(c);
      if (logo) fitImage(l, logo, w * 0.5, h * 0.5, w * 0.62, h * 0.52);
      else fitText(l, name, w / 2, h / 2, w * 0.74, h * 0.34, DISPLAY, 0, c);
    });
    ink('front', (l, w, h, c) => {
      const logo = logoIn(c);
      if (logo) fitImage(l, logo, w / 2, h / 2, w * 0.3, h * 0.42);
      else fitText(l, name.toUpperCase(), w / 2, h / 2, w * 0.56, h * 0.2, DISPLAY, 0.18, c);
    });
    ink('back', (l, w, h, c) => fitText(l, 'Thank you for choosing ' + name, w / 2, h / 2, w * 0.7, h * 0.12, SANS, 0.08, c));
    for (const side of ['left', 'right']) {
      ink(side, (l, w, h, c) => fitText(l, name.toUpperCase(), w / 2, h / 2, w * 0.7, h * 0.16, DISPLAY, 0.24, c));
    }
    ink('base', (l, w, h, c) => fitText(l, 'Made in Cairo by Raphael Studios', w / 2, h * 0.86, w * 0.6, h * 0.045, SANS, 0.06, c));

    // inside: a one-colour pattern of small marks, the message under the lid
    ins.fillStyle = f.inside;
    ins.fillRect(0, 0, this.inColour.width, this.inColour.height);
    ins.globalCompositeOperation = 'multiply';
    ins.globalAlpha = 0.18;
    ins.fillStyle = pat(ins);
    ins.fillRect(0, 0, this.inColour.width, this.inColour.height);
    ins.globalAlpha = 1;
    ins.globalCompositeOperation = 'source-over';
    const initial = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? 'R').toUpperCase();
    // the marks sit on a staggered grid: one tile of it (marks cut at its edges meet their other halves when it
    // repeats), drawn once per size and laid over each panel
    const tiles = new Map<number, CanvasPattern>();
    const tile = (step: number) => {
      const k = Math.round(step);
      if (!tiles.has(k)) {
        const t = canvas(k, Math.round(k * 1.732));
        const x = t.getContext('2d')!;
        x.fillStyle = f.insideInk;
        x.font = font(DISPLAY, k * 0.34);
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        for (const [px, py] of [[0, 0.25], [1, 0.25], [0.5, 0.75]]) x.fillText(initial, px * t.width, py * t.height);
        tiles.set(k, ins.createPattern(t, 'repeat')!);
      }
      return tiles.get(k)!;
    };
    for (const p of panels) {
      const s = this.inSlots.get(p.id)!;
      ins.save();
      ins.beginPath();
      ins.rect(s.x, s.y, s.w, s.h);
      ins.clip();
      ins.translate(s.x, s.y);
      ins.globalAlpha = 0.2;
      ins.fillStyle = tile(Math.max(14, (s.w / (s.u1 - s.u0)) * 0.026)); // a mark every 2.6 cm
      ins.fillRect(0, 0, s.w, s.h);
      ins.setTransform(1, 0, 0, 1, 0, 0);
      ins.globalAlpha = 1;
      // the creases show inside as fine pressed lines along each panel's edges
      ins.strokeStyle = 'rgba(0,0,0,0.16)';
      ins.lineWidth = 2;
      ins.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
      ins.restore();
    }
    const lid = this.inSlots.get('lid')!;
    ins.save();
    ins.fillStyle = f.inside;
    const mw = lid.w * 0.62;
    const mh = lid.h * 0.44;
    ins.fillRect(lid.x + (lid.w - mw) / 2, lid.y + (lid.h - mh) / 2, mw, mh);
    ins.fillStyle = f.insideInk;
    ins.textAlign = 'center';
    ins.textBaseline = 'alphabetic';
    ins.font = font(SCRIPT, lid.h * 0.2);
    ins.fillText('Thank you', lid.x + lid.w / 2, lid.y + lid.h * 0.53);
    ins.font = font(SANS, lid.h * 0.045);
    spaced(ins, `FROM ${name.toUpperCase()}`, lid.x + lid.w / 2, lid.y + lid.h * 0.64, 0.2);
    ins.restore();

    // the seal on the tissue: the brand's initial
    const st = this.sticker.getContext('2d')!;
    st.clearRect(0, 0, 256, 256);
    st.fillStyle = f.sticker;
    st.beginPath();
    st.arc(128, 128, 126, 0, Math.PI * 2);
    st.fill();
    st.strokeStyle = f.stickerInk;
    st.lineWidth = 3;
    st.beginPath();
    st.arc(128, 128, 112, 0, Math.PI * 2);
    st.stroke();
    if (d.logo) {
      st.drawImage(tint(fitted(d.logo, 150, 150), f.stickerInk), 53, 53);
    } else {
      st.fillStyle = f.stickerInk;
      st.font = font(DISPLAY, 130);
      st.textAlign = 'center';
      st.textBaseline = 'middle';
      st.fillText(initial, 128, 136);
    }
  }
}

/** the white parts of a mask, in a colour */
function tint(mask: HTMLCanvasElement, colour: string) {
  const c = canvas(mask.width, mask.height);
  const x = c.getContext('2d')!;
  x.drawImage(mask, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = colour;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function fitted(img: HTMLCanvasElement, w: number, h: number) {
  const c = canvas(w, h);
  const s = Math.min(w / img.width, h / img.height);
  c.getContext('2d')!.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
  return c;
}

function fitImage(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, cx: number, cy: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
}

/** one line of text, as large as fits the box (centred) */
function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, w: number, h: number, f: string, tracking = 0, colour = '#fff') {
  const size = fitSize(ctx, text, (px) => font(f, px), w, h, tracking);
  ctx.font = font(f, size);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (tracking) spaced(ctx, text, cx, cy, tracking, size);
  else ctx.fillText(text, cx, cy);
}

/** letter-spaced text, centred on (cx, y) */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, tracking: number, size?: number) {
  const px = size ?? parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '12');
  const gap = tracking * px;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + gap;
  });
  ctx.textAlign = align;
}

/** a logo file as an ink mask: its own transparency, or (for a flat picture) its dark parts */
export async function logoMask(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
  const c = canvas(Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, c.width, c.height);
  const img = x.getImageData(0, 0, c.width, c.height);
  const p = img.data;
  let transparent = 0;
  for (let i = 3; i < p.length; i += 4) if (p[i] < 200) transparent++;
  const hasAlpha = transparent > p.length / 4 * 0.05;
  for (let i = 0; i < p.length; i += 4) {
    const lum = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) / 255;
    // a flat picture: dark ink on a light ground (smooth edge between)
    const a = hasAlpha ? p[i + 3] / 255 : Math.min(1, Math.max(0, (0.82 - lum) / 0.3));
    p[i] = p[i + 1] = p[i + 2] = 255;
    p[i + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  bmp.close();
  return c;
}
