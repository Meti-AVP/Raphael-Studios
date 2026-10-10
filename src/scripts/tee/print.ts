// The shirt's surface, drawn in the pattern's own space (the UV atlas of tools/tee/build-tee.mjs):
//   base   the dyed cotton: its colour, a faint heather, the twin-needle stitching at the hems and the sleeves, the
//          rib collar, the side seams
//   print  the reader's marks (a name or a logo on the left chest, the front, the back, the sleeve; each printed or
//          embroidered in its own colour and size), transparent elsewhere; the shader lays it on the outside only
//   relief a height map for the embroidery's raised threads and the rib (read as a bump map)
import type { TeeData } from './data';
import { fitSize } from '../core/canvas-text';

export type Technique = 'print' | 'embroidery';
export type Placement = 'chest' | 'center' | 'back' | 'sleeve';
export type Font = 'classic' | 'bold' | 'script';

/** what is put on one place of the shirt */
export interface Mark {
  on: boolean;
  text: string;
  logo: HTMLImageElement | ImageBitmap | null;
  font: Font;
  /** the thread's or the ink's colour; 'original' keeps a logo's own colours */
  ink: string;
  technique: Technique;
  /** 1 = the place's usual size */
  size: number;
  /** metres above (+) or below (-) the place's usual height */
  lift: number;
}

export interface Design {
  colour: string;
  marks: Record<Placement, Mark>;
}

/**
 * the places, on the pattern (metres; x = 0 the piece's centre line, y up from its hem) with the art's usual width.
 * The pattern's +x is the wearer's left (the classic left-chest spot); seen from the front u runs left to right, so
 * art reads as drawn; the back panel and the sleeve are seen the other way round, so their art is mirrored.
 */
export const SPOTS: Record<Placement, { piece: string; x: number; y: number; w: number; flip: 1 | -1 }> = {
  chest: { piece: 'front', x: 0.095, y: 0.55, w: 0.095, flip: 1 },
  center: { piece: 'front', x: 0, y: 0.47, w: 0.26, flip: 1 },
  back: { piece: 'back', x: 0, y: 0.52, w: 0.28, flip: -1 },
  sleeve: { piece: 'sleeveL', x: 0.075, y: 0.1, w: 0.075, flip: -1 },
};

export const FONTS: Record<Font, (px: number) => string> = {
  classic: (px) => `700 ${px}px Philosopher, Georgia, serif`,
  bold: (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif`,
  script: (px) => `italic 700 ${px}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`,
};

interface PieceFrame {
  u0: number;
  v0: number;
  minX: number;
  minY: number;
}

export class PrintAtlas {
  readonly base: HTMLCanvasElement;
  readonly print: HTMLCanvasElement;
  readonly relief: HTMLCanvasElement;
  /** the collar's ribs (the part of the relief that does not change with the design) */
  private reliefBase: HTMLCanvasElement;
  private size: number;
  private frames: Record<string, PieceFrame> = {};
  private uvScale: number;
  private pattern: TeeData['pattern'];

  constructor(data: TeeData, size: number) {
    this.size = size;
    this.uvScale = data.uvScale;
    this.pattern = data.pattern;
    for (const [name, segs] of Object.entries(data.pattern)) {
      const pts = segs.flatMap((s) => s.pts);
      this.frames[name] = {
        u0: data.pieces[name].uv[0],
        v0: data.pieces[name].uv[1],
        minX: Math.min(...pts.map((p) => p[0])),
        minY: Math.min(...pts.map((p) => p[1])),
      };
    }
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      return c;
    };
    this.base = mk();
    this.print = mk();
    this.relief = mk();
    this.reliefBase = mk();
  }

  /** pattern metres on a piece -> canvas pixels */
  px(piece: string, x: number, y: number): [number, number] {
    const f = this.frames[piece];
    const u = f.u0 + (x - f.minX) * this.uvScale;
    const v = f.v0 + (y - f.minY) * this.uvScale;
    return [u * this.size, (1 - v) * this.size];
  }

  /** metres -> pixels (a length) */
  len(m: number) {
    return m * this.uvScale * this.size;
  }

  private outline(ctx: CanvasRenderingContext2D, piece: string) {
    ctx.beginPath();
    let first = true;
    for (const s of this.pattern[piece]) {
      for (const [x, y] of s.pts) {
        const [px, py] = this.px(piece, x, y);
        if (first) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        first = false;
      }
    }
    ctx.closePath();
  }

  private segment(piece: string, name: string) {
    return this.pattern[piece].find((s) => s.name === name)?.pts ?? [];
  }

  /** a line of stitches parallel to an edge, `inset` metres inside it */
  private stitches(ctx: CanvasRenderingContext2D, piece: string, seg: string, inset: number, colour: string) {
    const pts = this.segment(piece, seg);
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1, this.len(0.0011));
    ctx.setLineDash([this.len(0.003), this.len(0.0018)]);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      // offset inwards along the edge's normal (pieces are counter-clockwise: inside is to the left)
      const [ax, ay] = pts[Math.max(0, i - 1)];
      const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / l;
      const ny = (bx - ax) / l;
      const [px, py] = this.px(piece, x + nx * inset, y + ny * inset);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawBase(colour: string) {
    const ctx = this.base.getContext('2d')!;
    const s = this.size;
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, s, s);
    // heather: the faint unevenness of cotton yarn
    const img = ctx.getImageData(0, 0, s, s);
    const d = img.data;
    let seed = 7;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = ((seed / 2147483647) - 0.5) * 9;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(img, 0, 0);
    const shade = 'rgba(0,0,0,0.22)';
    const light = 'rgba(255,255,255,0.12)';
    // hems: twin-needle stitching 2 cm and 2.6 cm from the edge
    for (const p of ['front', 'back']) {
      this.stitches(ctx, p, 'hem', 0.02, shade);
      this.stitches(ctx, p, 'hem', 0.026, shade);
      this.stitches(ctx, p, 'hem', 0.0205, light);
    }
    for (const p of ['sleeveL', 'sleeveR']) {
      this.stitches(ctx, p, 'hem', 0.02, shade);
      this.stitches(ctx, p, 'hem', 0.026, shade);
    }
    // the rib collar: a 1.8 cm band round the neck, ribbed, with its stitch line
    const rel = this.reliefBase.getContext('2d')!;
    rel.fillStyle = '#808080';
    rel.fillRect(0, 0, s, s);
    for (const p of ['front', 'back']) {
      const pts = this.segment(p, 'neck');
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = this.len(0.018) * 2;
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const [px, py] = this.px(p, x, y);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
      // ribs on the relief map
      rel.save();
      rel.strokeStyle = '#b8b8b8';
      rel.lineWidth = Math.max(1, this.len(0.0012));
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const l = Math.hypot(bx - ax, by - ay) || 1;
        const steps = Math.ceil(l / 0.0026);
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const x = ax + (bx - ax) * t;
          const y = ay + (by - ay) * t;
          const nx = -(by - ay) / l;
          const ny = (bx - ax) / l;
          const [p0x, p0y] = this.px(p, x, y);
          const [p1x, p1y] = this.px(p, x + nx * 0.018, y + ny * 0.018);
          rel.beginPath();
          rel.moveTo(p0x, p0y);
          rel.lineTo(p1x, p1y);
          rel.stroke();
        }
      }
      rel.restore();
      this.stitches(ctx, p, 'neck', 0.019, shade);
    }
  }

  /** every place that has a mark, drawn on the print (and raised on the relief where it is embroidered) */
  drawPrint(design: Design) {
    const ctx = this.print.getContext('2d')!;
    const rel = this.relief.getContext('2d')!;
    ctx.clearRect(0, 0, this.size, this.size);
    rel.globalAlpha = 1;
    rel.filter = 'none';
    rel.drawImage(this.reliefBase, 0, 0);
    for (const [place, mark] of Object.entries(design.marks) as [Placement, Mark][]) if (mark.on) this.drawMark(ctx, rel, place, mark);
  }

  private drawMark(ctx: CanvasRenderingContext2D, rel: CanvasRenderingContext2D, place: Placement, m: Mark) {
    const spot = SPOTS[place];
    const [cx, cy] = this.px(spot.piece, spot.x, spot.y + m.lift);
    const w = this.len(spot.w * m.size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(spot.flip, 1);
    const art = document.createElement('canvas');
    art.width = Math.max(4, Math.ceil(w));
    art.height = Math.max(4, Math.ceil(w));
    const a = art.getContext('2d')!;
    a.fillStyle = m.ink === 'original' ? '#28281c' : m.ink;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    if (m.logo) {
      // a logo in its own colours, or in the mark's one colour: its shape filled, as one thread or one ink would be
      const lw = (m.logo as ImageBitmap).width;
      const lh = (m.logo as ImageBitmap).height;
      const k = Math.min(art.width / lw, art.height / lh) * 0.92;
      a.drawImage(m.logo, (art.width - lw * k) / 2, (art.height - lh * k) / 2, lw * k, lh * k);
      if (m.ink !== 'original') {
        a.globalCompositeOperation = 'source-in';
        a.fillRect(0, 0, art.width, art.height);
        a.globalCompositeOperation = 'source-over';
      }
    } else {
      const text = (m.text || 'Your brand').trim();
      const face = FONTS[m.font] ?? FONTS.classic;
      a.font = face(fitSize(a, text, face, art.width * 0.94, art.width * 0.32));
      a.fillText(text, art.width / 2, art.height / 2);
    }
    if (m.technique === 'embroidery') {
      // threads: the art becomes satin stitches (fine diagonal lines), and raised on the relief map
      const id = a.getImageData(0, 0, art.width, art.height);
      const p = id.data;
      for (let y = 0; y < art.height; y++) {
        for (let x = 0; x < art.width; x++) {
          const i = (y * art.width + x) * 4;
          if (p[i + 3] < 10) continue;
          const stripe = ((x + y) % 4) / 3;
          const lift = 0.82 + stripe * 0.3;
          p[i] = Math.min(255, p[i] * lift);
          p[i + 1] = Math.min(255, p[i + 1] * lift);
          p[i + 2] = Math.min(255, p[i + 2] * lift);
        }
      }
      a.putImageData(id, 0, 0);
    }
    ctx.drawImage(art, -art.width / 2, -art.height / 2);
    ctx.restore();
    // relief: embroidery stands up from the cloth; print sits flat (a hair of thickness)
    rel.save();
    rel.globalCompositeOperation = 'source-over';
    rel.translate(cx, cy);
    rel.scale(spot.flip, 1);
    rel.globalAlpha = m.technique === 'embroidery' ? 0.85 : 0.18;
    rel.filter = m.technique === 'embroidery' ? 'brightness(3) blur(0.6px)' : 'brightness(2)';
    rel.drawImage(art, -art.width / 2, -art.height / 2);
    rel.restore();
  }
}
