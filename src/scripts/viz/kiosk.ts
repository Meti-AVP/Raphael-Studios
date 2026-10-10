// The studio's pop-up kiosk, as the 3D team would model it: a 2.4 x 1.6 m platform, a back wall in the brand's
// colour with a lightbox and shelves, a lacquered counter with an oak top, a header in backlit letters, a plinth
// with the hero product, two stools and a plant. Every part also carries its edges (layer 1), drawn only in the
// blueprint, and the blueprint has its dimensions (in millimetres, as on a real drawing).
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitSize } from '../core/canvas-text';

export const LAYER_BLUEPRINT = 1;

export interface Brand {
  name: string;
  colour: string;
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

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

/** light oak: long grain with a few darker growth lines */
function oak() {
  const c = canvas(512, 512);
  const x = c.getContext('2d')!;
  x.fillStyle = '#c99f6e';
  x.fillRect(0, 0, 512, 512);
  const r = rng(7);
  for (let i = 0; i < 140; i++) {
    const y0 = r() * 512;
    const amp = 2 + r() * 6;
    const f = 0.004 + r() * 0.01;
    const ph = r() * 10;
    x.strokeStyle = r() < 0.6 ? `rgba(120,78,40,${0.06 + r() * 0.12})` : `rgba(240,210,170,${0.06 + r() * 0.1})`;
    x.lineWidth = 0.6 + r() * 2.2;
    x.beginPath();
    for (let px = 0; px <= 512; px += 8) {
      const py = y0 + Math.sin(px * f + ph) * amp;
      if (px === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const DISPLAY = (s: number) => `700 ${Math.round(s)}px Philosopher, Georgia, serif`;
const SANS = (s: number) => `600 ${Math.round(s)}px "Source Sans 3", Arial, sans-serif`;

function fit(x: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: (s: number) => string) {
  const s = fitSize(x, text, font, maxW, size);
  x.font = font(s);
  return s;
}

/** a dimension's figure, as a sprite (blueprint only) */
function label(text: string) {
  const c = canvas(256, 96);
  const x = c.getContext('2d')!;
  x.fillStyle = '#c9f4ee';
  x.font = SANS(54);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 50);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(0.34, 0.1275, 1);
  s.layers.set(LAYER_BLUEPRINT);
  s.renderOrder = 10;
  return s;
}

export class Kiosk {
  readonly group = new Group();
  private brand: Brand = { name: 'Raphael Studios', colour: '#19b5a8' };
  private paint: MeshStandardMaterial;
  private seat: MeshStandardMaterial;
  private productMats: MeshStandardMaterial[] = [];
  private lightbox = canvas(1024, 640);
  private header = canvas(1024, 192);
  private front = canvas(1024, 512);
  private tex: { lightbox: CanvasTexture; header: CanvasTexture; front: CanvasTexture };
  readonly lineMaterial = new LineBasicMaterial({ color: '#c9f4ee', transparent: true, opacity: 0.9 });

  constructor() {
    const g = this.group;
    const wood = oak();
    const oakMat = new MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0 });
    const oakTop = new MeshStandardMaterial({ map: wood.clone(), roughness: 0.5, metalness: 0 });
    oakTop.map!.repeat.set(2.2, 0.6);
    oakMat.map!.repeat.set(3, 2);
    const lacquer = new MeshPhysicalMaterial({ color: '#f4f2ec', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.12 });
    // matte wall paint: a little darker than the brand's swatch, as paint reads under show lighting
    this.paint = new MeshStandardMaterial({ color: this.brand.colour, roughness: 0.78 });
    this.seat = new MeshStandardMaterial({ color: this.brand.colour, roughness: 0.5 });
    const metal = new MeshStandardMaterial({ color: '#bdbcb6', roughness: 0.28, metalness: 1 });
    const dark = new MeshStandardMaterial({ color: '#2a2a27', roughness: 0.5, metalness: 0.4 });
    const led = new MeshBasicMaterial({ color: '#c9fff8' });
    const leaf = new MeshStandardMaterial({ color: '#4c7a45', roughness: 0.8, flatShading: true });
    const pot = new MeshStandardMaterial({ color: '#e7e1d4', roughness: 0.85 });

    // edges: drawn where faces meet at more than `crease` degrees (a low-poly plant shows every facet)
    const add = (geo: BufferGeometry, mat: Material, x: number, y: number, z: number, edges = true, crease = 28) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      // the parts without edges are surfaces of others (the lightbox's face, the letters, the prints, the light)
      m.userData.decal = !edges;
      if (edges) {
        const e = new LineSegments(new EdgesGeometry(geo, crease), this.lineMaterial);
        e.layers.set(LAYER_BLUEPRINT);
        m.add(e);
      }
      g.add(m);
      return m;
    };

    // the platform and the back wall
    add(new RoundedBoxGeometry(2.4, 0.08, 1.6, 2, 0.02), oakMat, 0, 0.04, 0);
    add(new BoxGeometry(2.4, 2.4, 0.12), this.paint, 0, 1.28, -0.74);
    // the lightbox: a lit graphic in a thin aluminium frame
    this.tex = {
      lightbox: new CanvasTexture(this.lightbox),
      header: new CanvasTexture(this.header),
      front: new CanvasTexture(this.front),
    };
    for (const t of Object.values(this.tex)) {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
    }
    add(new BoxGeometry(1.46, 0.96, 0.05), metal, 0, 1.55, -0.66);
    const box = add(new PlaneGeometry(1.4, 0.9), new MeshBasicMaterial({ map: this.tex.lightbox }), 0, 1.55, -0.633, false);
    box.castShadow = false;
    // the header: backlit letters on the wall's top
    const head = add(new PlaneGeometry(1.9, 0.36), new MeshBasicMaterial({ map: this.tex.header, transparent: true, depthWrite: false }), 0, 2.28, -0.676, false);
    head.castShadow = false;
    // shelves either side, with the products (in two materials: the brand's colour and white)
    const brandBox = new MeshStandardMaterial({ color: this.brand.colour, roughness: 0.5 });
    const whiteBox = new MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.55 });
    this.productMats.push(brandBox);
    const r = rng(11);
    for (const sx of [-0.88, 0.88]) {
      for (const sy of [1.05, 1.45]) {
        add(new BoxGeometry(0.5, 0.03, 0.24), oakMat, sx, sy, -0.56);
        let x = sx - 0.2;
        while (x < sx + 0.19) {
          if (r() < 0.55) {
            const w = 0.09 + r() * 0.03;
            const h = 0.12 + r() * 0.06;
            const m = r() < 0.5 ? brandBox : whiteBox;
            add(new BoxGeometry(w, h, 0.08), m, x + w / 2, sy + 0.015 + h / 2, -0.56);
            x += w + 0.025;
          } else {
            const h = 0.17 + r() * 0.05;
            add(new CylinderGeometry(0.03, 0.033, h, 20), lacquer, x + 0.035, sy + 0.015 + h / 2, -0.56);
            add(new CylinderGeometry(0.02, 0.02, 0.03, 16), brandBox, x + 0.035, sy + 0.015 + h + 0.015, -0.56);
            x += 0.09;
          }
        }
      }
    }
    // the counter: lacquer body, oak top, the brand on its front, a light under it
    add(new RoundedBoxGeometry(1.4, 0.96, 0.55, 3, 0.03), lacquer, 0, 0.08 + 0.48 + 0.02, 0.12);
    add(new RoundedBoxGeometry(1.5, 0.04, 0.62, 2, 0.012), oakTop, 0, 0.08 + 0.98 + 0.02, 0.12);
    const decal = add(new PlaneGeometry(1.2, 0.6), new MeshBasicMaterial({ map: this.tex.front, transparent: true, depthWrite: false }), 0, 0.62, 0.3965, false);
    decal.castShadow = false;
    // (a basic material would ignore the light: the counter's front is lit, so its print takes the light too)
    (decal.material as MeshBasicMaterial).dispose();
    decal.material = new MeshStandardMaterial({ map: this.tex.front, transparent: true, depthWrite: false, roughness: 0.4 });
    add(new BoxGeometry(1.32, 0.012, 0.02), led, 0, 0.096, 0.385, false);
    // the plinth with the hero product
    add(new CylinderGeometry(0.21, 0.21, 0.92, 40), lacquer, 0.92, 0.08 + 0.46, 0.42);
    const hero = brandBox;
    add(new RoundedBoxGeometry(0.2, 0.28, 0.14, 3, 0.012), hero, 0.92, 0.08 + 0.92 + 0.14, 0.42);
    // two stools
    for (const sx of [-0.36, 0.34]) {
      add(new CylinderGeometry(0.19, 0.19, 0.012, 32), metal, sx, 0.086, 0.74);
      add(new CylinderGeometry(0.022, 0.022, 0.66, 12), metal, sx, 0.08 + 0.34, 0.74);
      add(new CylinderGeometry(0.17, 0.16, 0.06, 32), this.seat, sx, 0.08 + 0.69, 0.74);
    }
    // a plant
    add(new CylinderGeometry(0.15, 0.11, 0.36, 28), pot, -0.95, 0.08 + 0.18, 0.46);
    const foliage = new IcosahedronGeometry(0.3, 1);
    foliage.scale(1, 1.25, 1);
    add(foliage, leaf, -0.95, 0.08 + 0.36 + 0.3, 0.46, true, 1);
    // the track lights over the wall
    // (the rail's arms stand clear of the header's letters)
    add(new BoxGeometry(2.3, 0.04, 0.04), dark, 0, 2.62, -0.25);
    for (const lx of [-0.7, 0, 0.7]) {
      const head = add(new CylinderGeometry(0.04, 0.055, 0.14, 16), dark, lx, 2.55, -0.25);
      head.rotation.x = -0.6;
    }
    add(new BoxGeometry(0.04, 0.4, 0.04), dark, -1.13, 2.42, -0.48);
    add(new BoxGeometry(0.04, 0.4, 0.04), dark, 1.13, 2.42, -0.48);

    this.dimensions();
    this.merge();
    this.setBrand(this.brand);
  }

  /** nothing in the kiosk moves: the parts that share a material become one mesh, and all the edges one set of
   *  lines (a dozen draws per pass instead of a hundred and more) */
  private merge() {
    const g = this.group;
    g.updateMatrixWorld(true);
    const byMaterial = new Map<Material, Mesh[]>();
    const edges: BufferGeometry[] = [];
    for (const child of [...g.children]) {
      if (!(child instanceof Mesh) || child.userData.decal) continue;
      for (const c of child.children) if (c instanceof LineSegments) edges.push(c.geometry.clone().applyMatrix4(child.matrix));
      child.clear();
      const m = child.material as Material;
      if (!byMaterial.has(m)) byMaterial.set(m, []);
      byMaterial.get(m)!.push(child);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const geos = meshes.map((m) => {
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        return geo.applyMatrix4(m.matrix);
      });
      const merged = new Mesh(mergeGeometries(geos, false), material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      for (const m of meshes) {
        g.remove(m);
        m.geometry.dispose();
      }
      g.add(merged);
    }
    const lines = new LineSegments(mergeGeometries(edges, false), this.lineMaterial);
    lines.layers.set(LAYER_BLUEPRINT);
    g.add(lines);
  }

  /** dimension lines with their figures (blueprint only) */
  private dimensions() {
    const lines: number[] = [];
    const seg = (a: number[], b: number[]) => lines.push(...a, ...b);
    const tick = (p: number[], dx: number, dy: number, dz: number) => seg([p[0] - dx, p[1] - dy, p[2] - dz], [p[0] + dx, p[1] + dy, p[2] + dz]);
    // width along the front
    seg([-1.2, 0.002, 0.98], [1.2, 0.002, 0.98]);
    tick([-1.2, 0.002, 0.98], 0, 0, 0.05);
    tick([1.2, 0.002, 0.98], 0, 0, 0.05);
    // depth along the right
    seg([1.32, 0.002, -0.8], [1.32, 0.002, 0.8]);
    tick([1.32, 0.002, -0.8], 0.05, 0, 0);
    tick([1.32, 0.002, 0.8], 0.05, 0, 0);
    // height on the left of the wall
    seg([-1.32, 0, -0.8], [-1.32, 2.48, -0.8]);
    tick([-1.32, 0, -0.8], 0.05, 0, 0);
    tick([-1.32, 2.48, -0.8], 0.05, 0, 0);
    // the counter's height
    seg([0.82, 0.08, 0.5], [0.82, 1.1, 0.5]);
    tick([0.82, 1.1, 0.5], 0.04, 0, 0);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(lines, 3));
    const dims = new LineSegments(geo, this.lineMaterial);
    dims.layers.set(LAYER_BLUEPRINT);
    this.group.add(dims);
    const put = (t: string, x: number, y: number, z: number) => {
      const l = label(t);
      l.position.set(x, y, z);
      this.group.add(l);
    };
    put('2400', 0, 0.06, 1.06);
    put('1600', 1.42, 0.06, 0);
    put('2480', -1.44, 1.24, -0.8);
    put('1100', 0.68, 0.62, 0.5);
  }

  setBrand(b: Partial<Brand>) {
    this.brand = { ...this.brand, ...b };
    const { name: raw, colour } = this.brand;
    const name = raw.trim() || 'Your brand';
    this.paint.color.set(colour).multiplyScalar(0.82);
    this.seat.color.set(colour);
    for (const m of this.productMats) m.color.set(colour);
    // the lightbox: the brand large, on a lit gradient of its colour
    {
      const x = this.lightbox.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 1024, 640);
      g.addColorStop(0, shade(colour, 0.25));
      g.addColorStop(1, shade(colour, -0.35));
      x.fillStyle = g;
      x.fillRect(0, 0, 1024, 640);
      x.fillStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 9; i++) x.fillRect(0, 70 * i + 20, 1024, 2);
      x.fillStyle = '#f7f5ee';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      fit(x, name, 860, 170, DISPLAY);
      x.fillText(name, 512, 300);
      x.font = SANS(30);
      x.globalAlpha = 0.8;
      x.fillText('D E S I G N E D   I N   3 D   B Y   R A P H A E L   S T U D I O S', 512, 452);
      x.globalAlpha = 1;
    }
    // the header: cream letters with a soft glow, on nothing
    {
      const x = this.header.getContext('2d')!;
      x.clearRect(0, 0, 1024, 192);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const s = fit(x, name.toUpperCase(), 960, 120, DISPLAY);
      x.font = DISPLAY(s);
      x.shadowColor = 'rgba(255,250,230,0.9)';
      x.shadowBlur = 18;
      x.fillStyle = '#fffaf0';
      x.fillText(name.toUpperCase(), 512, 100);
    }
    // the counter's front: the name in the brand's colour
    {
      const x = this.front.getContext('2d')!;
      x.clearRect(0, 0, 1024, 512);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = colour;
      fit(x, name, 880, 150, DISPLAY);
      x.fillText(name, 512, 256);
    }
    for (const t of Object.values(this.tex)) t.needsUpdate = true;
  }
}

/** a colour lighter (t > 0) or darker (t < 0) */
function shade(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

