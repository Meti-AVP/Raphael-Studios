// The giveaways, modelled at their real sizes and printed with the reader's brand: a beach ball, a football, a
// steel bottle, a tumbler, a mug, a cap, a notebook, a pen, a tote, a gift box and a rolled beach towel. Each one
// is a mesh group and the shapes it collides with (spheres, capsules, boxes), with its weight and how it bounces.
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { BodyOptions, Shape } from './physics';
import { fitSize } from '../core/canvas-text';

export interface Brand {
  name: string;
  colour: string;
  /** the brand's logo (its ground already clear): printed in place of the words, in the print's colour or its own */
  logo?: ImageBitmap | HTMLCanvasElement | null;
  /** the logo keeps its own colours (a full-colour print) */
  own?: boolean;
}

export interface ItemKind {
  id: string;
  build: (t: Prints) => { object: Group; body: Omit<BodyOptions, 'shapes'> & { shapes: Shape[] } };
}

const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const sphere = (r: number, c = V(0, 0, 0)): Shape => ({ kind: 'sphere', r, c });
const capsule = (r: number, a: Vector3, b: Vector3): Shape => ({ kind: 'capsule', r, a, b });
const box = (hx: number, hy: number, hz: number, c = V(0, 0, 0), q = new Quaternion()): Shape => ({ kind: 'box', h: V(hx, hy, hz), c, q });

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const DISPLAY = (s: number) => `700 ${Math.round(s)}px Philosopher, Georgia, serif`;

function fitText(x: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, size: number, colour: string, rotate = 0) {
  x.font = DISPLAY(fitSize(x, text, DISPLAY, maxW, size));
  x.save();
  x.translate(cx, cy);
  x.rotate(rotate);
  x.fillStyle = colour;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 0, 0);
  x.restore();
}

/** the brand on a surface: its logo where it has one (fitted into the words' place, in the words' colour or its
 * own), else the words */
function brandMark(x: CanvasRenderingContext2D, b: Brand, text: string, cx: number, cy: number, maxW: number, size: number, colour: string, rotate = 0) {
  if (!b.logo) return fitText(x, text, cx, cy, maxW, size, colour, rotate);
  const lw = b.logo.width;
  const lh = b.logo.height;
  const k = Math.min(maxW / lw, (size * 1.5) / lh);
  const w = Math.max(1, Math.round(lw * k));
  const h = Math.max(1, Math.round(lh * k));
  const art = canvas(w, h);
  const a = art.getContext('2d')!;
  a.drawImage(b.logo, 0, 0, w, h);
  if (!b.own) {
    a.globalCompositeOperation = 'source-in';
    a.fillStyle = colour;
    a.fillRect(0, 0, w, h);
  }
  x.save();
  x.translate(cx, cy);
  x.rotate(rotate);
  x.drawImage(art, -w / 2, -h / 2);
  x.restore();
}

const SUN = '#f2c14e';
const WHITE = '#f6f4ee';

/** every printed surface, redrawn when the brand changes */
export class Prints {
  private painters: { tex: CanvasTexture; paint: (x: CanvasRenderingContext2D, w: number, h: number, b: Brand) => void }[] = [];
  /** materials in the brand's colour */
  readonly tinted: (MeshStandardMaterial | MeshPhysicalMaterial)[] = [];
  brand: Brand = { name: 'Raphael Studios', colour: '#19b5a8' };

  texture(w: number, h: number, paint: (x: CanvasRenderingContext2D, w: number, h: number, b: Brand) => void) {
    const c = canvas(w, h);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    this.painters.push({ tex, paint });
    paint(c.getContext('2d')!, w, h, this.brand);
    return tex;
  }

  tint<T extends MeshStandardMaterial | MeshPhysicalMaterial>(m: T) {
    m.color.set(this.brand.colour);
    this.tinted.push(m);
    return m;
  }

  setBrand(b: Partial<Brand>) {
    this.brand = { ...this.brand, ...b };
    for (const p of this.painters) {
      const c = p.tex.image as HTMLCanvasElement;
      const x = c.getContext('2d')!;
      x.clearRect(0, 0, c.width, c.height);
      p.paint(x, c.width, c.height, this.brand);
      p.tex.needsUpdate = true;
    }
    for (const m of this.tinted) m.color.set(this.brand.colour);
  }
}

/** a turned shape whose print runs by height (a lathe's own texture rows follow its profile points) */
function turned(points: [number, number][], segments: number) {
  const geo = new LatheGeometry(points.map(([x, y]) => new Vector2(x, y)), segments);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    lo = Math.min(lo, pos.getY(i));
    hi = Math.max(hi, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) - lo) / (hi - lo));
  return geo;
}

const mesh = (geo: BufferGeometry, mat: Material | Material[]) => {
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const initial = (b: Brand) => (b.name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? 'R').toUpperCase();
const nameOf = (b: Brand) => b.name.trim() || 'Your brand';

export const KINDS: ItemKind[] = [
  {
    // an inflatable beach ball: six panels, the brand on a white one; 40 g of air and vinyl
    id: 'beachball',
    build: (t) => {
      const map = t.texture(1024, 512, (x, w, h, b) => {
        const cols = [b.colour, WHITE, SUN, WHITE, b.colour, WHITE];
        cols.forEach((c, i) => {
          x.fillStyle = c;
          x.fillRect((i * w) / 6, 0, w / 6 + 1, h);
        });
        brandMark(x, b, nameOf(b), (w / 6) * 1.5, h / 2, h * 0.62, w * 0.06, b.colour, -Math.PI / 2);
        x.fillStyle = WHITE;
        x.fillRect(0, 0, w, h * 0.07);
        x.fillRect(0, h * 0.93, w, h * 0.07);
      });
      const g = new Group();
      g.add(mesh(new SphereGeometry(0.13, 40, 24), new MeshPhysicalMaterial({ map, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 })));
      return { object: g, body: { mass: 0.04, shapes: [sphere(0.13)], hollow: true, drag: 0.9, restitution: 0.72, friction: 0.5 } };
    },
  },
  {
    // a football: white with the brand's colour in a panelled pattern
    id: 'football',
    build: (t) => {
      const map = t.texture(1024, 512, (x, w, h, b) => {
        x.fillStyle = WHITE;
        x.fillRect(0, 0, w, h);
        x.fillStyle = b.colour;
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < 8; col++) {
            const cx = ((col + (row % 2) * 0.5) / 8) * w;
            const cy = ((row + 0.5) / 4) * h;
            const r = h * 0.07;
            x.beginPath();
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
              x.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r);
            }
            x.fill();
          }
        x.fillStyle = WHITE;
        x.fillRect(w * 0.3, h * 0.42, w * 0.4, h * 0.16);
        brandMark(x, b, nameOf(b).toUpperCase(), w / 2, h / 2, w * 0.36, h * 0.11, b.colour);
      });
      const g = new Group();
      g.add(mesh(new SphereGeometry(0.11, 40, 24), new MeshPhysicalMaterial({ map, roughness: 0.45, clearcoat: 0.3 })));
      return { object: g, body: { mass: 0.43, shapes: [sphere(0.11)], hollow: true, drag: 0.12, restitution: 0.62, friction: 0.6 } };
    },
  },
  {
    // a steel water bottle in the brand's colour, the name up its side
    id: 'bottle',
    build: (t) => {
      const body = turned(
        [
          [0, -0.12],
          [0.03, -0.12],
          [0.036, -0.112],
          [0.036, 0.04],
          [0.032, 0.07],
          [0.02, 0.09],
          [0.019, 0.1],
          [0, 0.1],
        ],
        40,
      );
      const label = t.texture(512, 256, (x, w, h, b) => {
        x.fillStyle = b.colour;
        x.fillRect(0, 0, w, h);
        brandMark(x, b, nameOf(b), w * 0.25, h * 0.42, w * 0.4, h * 0.16, WHITE);
      });
      const g = new Group();
      g.add(mesh(body, new MeshPhysicalMaterial({ map: label, roughness: 0.35, metalness: 0.5, clearcoat: 0.6 })));
      const cap = mesh(new CylinderGeometry(0.021, 0.021, 0.03, 28), new MeshStandardMaterial({ color: '#262624', roughness: 0.5 }));
      cap.position.y = 0.112;
      g.add(cap);
      return {
        object: g,
        body: { mass: 0.32, shapes: [capsule(0.036, V(0, -0.084, 0), V(0, 0.084, 0))], size: V(0.036, 0.12, 0.036), restitution: 0.25, friction: 0.45 },
      };
    },
  },
  {
    // a white tumbler with the brand printed round it
    id: 'tumbler',
    build: (t) => {
      const pts: [number, number][] = [
        [0, -0.075],
        [0.034, -0.075],
        [0.042, 0.068],
        [0.044, 0.075],
        [0.038, 0.075],
        [0.034, -0.065],
        [0, -0.065],
      ];
      const print = t.texture(512, 256, (x, w, h, b) => {
        x.fillStyle = WHITE;
        x.fillRect(0, 0, w, h);
        x.fillStyle = b.colour;
        x.fillRect(0, h * 0.78, w, h * 0.08);
        brandMark(x, b, nameOf(b), w * 0.25, h * 0.45, w * 0.42, h * 0.24, b.colour);
      });
      const g = new Group();
      g.add(mesh(turned(pts, 40), new MeshPhysicalMaterial({ map: print, roughness: 0.25, clearcoat: 0.8, side: DoubleSide })));
      const lid = mesh(new CylinderGeometry(0.044, 0.044, 0.014, 32), t.tint(new MeshStandardMaterial({ roughness: 0.4 })));
      lid.position.y = 0.082;
      g.add(lid);
      return {
        object: g,
        body: { mass: 0.26, shapes: [capsule(0.043, V(0, -0.04, 0), V(0, 0.046, 0))], size: V(0.043, 0.08, 0.043), restitution: 0.25, friction: 0.5 },
      };
    },
  },
  {
    // a ceramic mug with the brand's initial
    id: 'mug',
    build: (t) => {
      const print = t.texture(512, 256, (x, w, h, b) => {
        x.fillStyle = WHITE;
        x.fillRect(0, 0, w, h);
        brandMark(x, b, initial(b), w * 0.75, h * 0.52, w * 0.2, h * 0.62, b.colour);
      });
      const g = new Group();
      const cup = new CylinderGeometry(0.042, 0.04, 0.095, 40, 1, true);
      const glaze = new MeshPhysicalMaterial({ map: print, roughness: 0.18, clearcoat: 1, side: DoubleSide });
      g.add(mesh(cup, glaze));
      const base = mesh(new CircleGeometry(0.04, 32), new MeshPhysicalMaterial({ color: WHITE, roughness: 0.2, clearcoat: 1 }));
      base.rotation.x = Math.PI / 2;
      base.position.y = -0.047;
      g.add(base);
      const inside = mesh(new CircleGeometry(0.04, 32), t.tint(new MeshStandardMaterial({ roughness: 0.3 })));
      inside.rotation.x = -Math.PI / 2;
      inside.position.y = -0.04;
      g.add(inside);
      const handle = mesh(new TorusGeometry(0.026, 0.007, 12, 24, Math.PI), new MeshPhysicalMaterial({ color: WHITE, roughness: 0.2, clearcoat: 1 }));
      handle.rotation.z = -Math.PI / 2;
      handle.position.x = 0.042;
      g.add(handle);
      return {
        object: g,
        body: { mass: 0.33, shapes: [box(0.042, 0.048, 0.042), sphere(0.012, V(0.064, 0, 0))], size: V(0.055, 0.048, 0.042), restitution: 0.2, friction: 0.5 },
      };
    },
  },
  {
    // a cap in the brand's colour, the initial embroidered on its front
    id: 'cap',
    build: (t) => {
      const front = t.texture(512, 256, (x, w, h, b) => {
        x.fillStyle = b.colour;
        x.fillRect(0, 0, w, h);
        // the front of the crown (towards the brim, +z) is a quarter of the way round its texture
        brandMark(x, b, initial(b), w * 0.25, h * 0.6, w * 0.16, h * 0.42, WHITE);
      });
      const g = new Group();
      const crown = new SphereGeometry(0.09, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      crown.scale(1, 0.82, 1.08);
      const fabric = new MeshStandardMaterial({ map: front, roughness: 0.92 });
      g.add(mesh(crown, fabric));
      const brim = new CylinderGeometry(0.085, 0.085, 0.006, 32, 1, false, -Math.PI / 2, Math.PI);
      brim.scale(1, 1, 0.9);
      const bm = mesh(brim, t.tint(new MeshStandardMaterial({ roughness: 0.9 })));
      bm.position.set(0, 0.004, 0.07);
      bm.rotation.x = 0.12;
      g.add(bm);
      const button = mesh(new SphereGeometry(0.008, 12, 8), t.tint(new MeshStandardMaterial({ roughness: 0.6 })));
      button.position.y = 0.073;
      g.add(button);
      g.position.y = -0.03;
      const holder = new Group();
      holder.add(g);
      return {
        object: holder,
        // the crown sits on its rim (a low box) and is round on top (a ball); the brim is a thin plate
        body: { mass: 0.11, shapes: [box(0.08, 0.03, 0.085), sphere(0.045), box(0.07, 0.004, 0.04, V(0, -0.026, 0.1))], size: V(0.09, 0.04, 0.1), drag: 0.6, restitution: 0.15, friction: 0.8 },
      };
    },
  },
  {
    // an A5 notebook: a cloth cover in the brand's colour, the name pressed into it, an elastic band
    id: 'notebook',
    build: (t) => {
      const cover = t.texture(512, 512, (x, w, h, b) => {
        x.fillStyle = b.colour;
        x.fillRect(0, 0, w, h);
        x.fillStyle = 'rgba(0,0,0,0.18)';
        x.fillRect(w * 0.84, 0, w * 0.05, h);
        brandMark(x, b, nameOf(b), w * 0.42, h * 0.5, w * 0.62, h * 0.11, 'rgba(255,255,255,0.88)');
      });
      const g = new Group();
      const paper = new MeshStandardMaterial({ color: '#f2eee4', roughness: 0.95 });
      const coverMat = new MeshStandardMaterial({ map: cover, roughness: 0.85 });
      // faces: +x, -x, +y (cover), -y (back), +z, -z
      g.add(mesh(new BoxGeometry(0.148, 0.016, 0.21), [paper, paper, coverMat, t.tint(new MeshStandardMaterial({ roughness: 0.85 })), paper, paper]));
      return { object: g, body: { mass: 0.26, shapes: [box(0.074, 0.008, 0.105)], size: V(0.074, 0.008, 0.105), restitution: 0.1, friction: 0.7 } };
    },
  },
  {
    // a pen in the brand's colour with a steel tip and clip
    id: 'pen',
    build: (t) => {
      const g = new Group();
      const barrel = mesh(new CylinderGeometry(0.0055, 0.0055, 0.12, 16), t.tint(new MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.8 })));
      g.add(barrel);
      const steel = new MeshStandardMaterial({ color: '#c9c8c2', metalness: 1, roughness: 0.25 });
      const tip = mesh(new CylinderGeometry(0.0055, 0.001, 0.018, 16), steel);
      tip.position.y = -0.069;
      g.add(tip);
      const clip = mesh(new BoxGeometry(0.003, 0.04, 0.0015), steel);
      clip.position.set(0, 0.04, 0.0065);
      g.add(clip);
      return { object: g, body: { mass: 0.02, shapes: [capsule(0.0065, V(0, -0.07, 0), V(0, 0.06, 0))], size: V(0.006, 0.07, 0.006), restitution: 0.3, friction: 0.5 } };
    },
  },
  {
    // a cotton tote, folded flat, the brand printed large
    id: 'tote',
    build: (t) => {
      const print = t.texture(512, 512, (x, w, h, b) => {
        x.fillStyle = '#ece4d3';
        x.fillRect(0, 0, w, h);
        for (let i = 0; i < 2400; i++) {
          x.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`;
          x.fillRect(Math.random() * w, Math.random() * h, 2, 1);
        }
        brandMark(x, b, nameOf(b), w / 2, h * 0.5, w * 0.78, h * 0.14, b.colour);
        x.fillStyle = b.colour;
        x.fillRect(w * 0.3, h * 0.6, w * 0.4, 4);
      });
      const g = new Group();
      const canvasMat = new MeshStandardMaterial({ map: print, roughness: 0.95 });
      const plain = new MeshStandardMaterial({ color: '#e6ddca', roughness: 0.95 });
      g.add(mesh(new RoundedBoxGeometry(0.34, 0.012, 0.38, 2, 0.005), [plain, plain, canvasMat, plain, plain, plain]));
      const strap = t.tint(new MeshStandardMaterial({ roughness: 0.9 }));
      for (const sx of [-0.06, 0.06]) {
        const handle = mesh(new TorusGeometry(0.05, 0.006, 8, 20, Math.PI), strap);
        handle.rotation.x = -Math.PI / 2;
        handle.position.set(sx, 0.008, -0.19);
        handle.scale.set(0.6, 1, 1);
        g.add(handle);
      }
      return { object: g, body: { mass: 0.16, shapes: [box(0.17, 0.008, 0.19)], size: V(0.17, 0.008, 0.19), drag: 1.2, restitution: 0.05, friction: 0.9 } };
    },
  },
  {
    // a white gift box tied with a ribbon in the brand's colour
    id: 'gift',
    build: (t) => {
      const g = new Group();
      const white = new MeshStandardMaterial({ color: WHITE, roughness: 0.75 });
      g.add(mesh(new BoxGeometry(0.12, 0.09, 0.12), white));
      const ribbon = t.tint(new MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 }));
      g.add(mesh(new BoxGeometry(0.124, 0.094, 0.022), ribbon));
      g.add(mesh(new BoxGeometry(0.022, 0.094, 0.124), ribbon));
      for (const r of [0.6, -0.6]) {
        const loop = mesh(new TorusGeometry(0.02, 0.006, 8, 18), ribbon);
        loop.position.y = 0.054;
        loop.rotation.set(Math.PI / 2 - 0.5, r, 0);
        g.add(loop);
      }
      return { object: g, body: { mass: 0.3, shapes: [box(0.06, 0.045, 0.06)], size: V(0.06, 0.045, 0.06), restitution: 0.15, friction: 0.65 } };
    },
  },
  {
    // a beach towel, rolled, in stripes of the brand's colour
    id: 'towel',
    build: (t) => {
      const stripes = t.texture(512, 512, (x, w, h, b) => {
        const cols = [b.colour, WHITE, b.colour, SUN, b.colour, WHITE];
        cols.forEach((c, i) => {
          x.fillStyle = c;
          x.fillRect(0, (i * h) / 6, w, h / 6 + 1);
        });
        for (let i = 0; i < 3000; i++) {
          x.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
          x.fillRect(Math.random() * w, Math.random() * h, 1, 1);
        }
      });
      // the ends show the roll: a spiral of the towel's layers
      const ends = t.texture(256, 256, (x, w, h, b) => {
        x.fillStyle = WHITE;
        x.fillRect(0, 0, w, h);
        x.strokeStyle = b.colour;
        x.lineWidth = 7;
        x.beginPath();
        for (let a = 0; a < Math.PI * 2 * 5; a += 0.05) {
          const r = 6 + (a / (Math.PI * 2)) * 23;
          x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
        }
        x.stroke();
      });
      const g = new Group();
      const side = new MeshStandardMaterial({ map: stripes, roughness: 1 });
      const end = new MeshStandardMaterial({ map: ends, roughness: 1 });
      const roll = mesh(new CylinderGeometry(0.05, 0.05, 0.28, 32), [side, end, end]);
      g.add(roll);
      return { object: g, body: { mass: 0.42, shapes: [capsule(0.05, V(0, -0.09, 0), V(0, 0.09, 0))], size: V(0.05, 0.14, 0.05), restitution: 0.05, friction: 0.9 } };
    },
  },
];

