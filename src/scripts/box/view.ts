// The packaging studio's box on screen: one creased sheet of board that folds itself into a mailer box, its lid
// hanging on its crease (gravity, a little memory in the board, a magnet at the front), tissue and a seal inside,
// printed with the reader's brand in the chosen finish.
//
// Each crease is a damped spring that follows the fold (so panels arrive with the small overshoot of real board);
// once the box is closed the lid is simulated about its crease: drag it, throw it, let it fall.
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { compileInSteps, nextTask, studioEnvironment, uploadTextures } from '../core/studio-env';
import { D, H, LID_CLOSED, LID_LENGTH, LID_OPEN_LIMIT, panels, sheet, T, W, type Panel } from './dieline';
import { BoxPrint, FINISHES, type BoxDesign } from './print';

export interface BoxViewOptions {
  canvas: HTMLCanvasElement;
  quality: 'hi' | 'lo';
  onReady?: () => void;
  /** the box's state changed: 'flat', 'folding', 'closed', 'open' */
  onState?: (s: BoxState) => void;
}
export type BoxState = 'flat' | 'folding' | 'closed' | 'open' | 'unfolding';

interface Hinge {
  spec: Panel;
  group: Object3D;
  mesh: Mesh;
  axis: Vector3;
  angle: number;
  vel: number;
  /** the angle it unfolds from (where it was when the unfolding began) */
  from: number;
}

const LID_PARTS = new Set(['lid', 'tuck', 'lid-flap-left', 'lid-flap-right']);
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export class BoxView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.02, 10);
  private box = new Group();
  private hinges = new Map<string, Hinge>();
  private print: BoxPrint;
  private tex: { col: CanvasTexture; fin: CanvasTexture; rel: CanvasTexture; ins: CanvasTexture; sticker: CanvasTexture };
  private outer: MeshPhysicalMaterial;
  private inner: MeshStandardMaterial;
  private edge: MeshStandardMaterial;
  private tissue = new Group();
  private tissueMat: MeshPhysicalMaterial;
  private tissueY = 0.45;
  private tissueV = 0;
  private design: BoxDesign = { finish: 'kraft', text: 'Raphael Studios', logo: null };
  /** the fold: 0 flat sheet, 1 closed box; where it is going */
  private fold = 0;
  private foldTo = 0;
  private lid = { a: 0, w: 0 };
  private grab: { plane: Plane; offset: number; target: number } | null = null;
  private hand: { target: number; until: number } | null = null;
  private turning: { x: number; yaw: number; moved: boolean } | null = null;
  private press: { x: number; y: number; t: number; onLid: boolean } | null = null;
  private yaw = -0.5;
  private yawVel = 0;
  private pointer = new Vector2();
  private ray = new Raycaster();
  private visible = true;
  private dirty = true;
  private state: BoxState = 'flat';
  private time = 0;
  hovering: 'lid' | 'box' | null = null;
  onHover: ((on: 'lid' | 'box' | null) => void) | null = null;

  constructor(private opts: BoxViewOptions) {
    const r = new WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'hi' ? 2 : 1.5));
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap; // soft through each light's shadow radius (PCFSoft is gone: it would recompile every material)
    r.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer = r;
    this.print = new BoxPrint(opts.quality === 'hi' ? 2048 : 1024);
    const t = (c: HTMLCanvasElement, srgb: boolean) => {
      const x = new CanvasTexture(c);
      if (srgb) x.colorSpace = SRGBColorSpace;
      x.anisotropy = 8;
      x.minFilter = LinearMipmapLinearFilter;
      return x;
    };
    this.tex = {
      col: t(this.print.outColour, true),
      fin: t(this.print.outFinish, false),
      rel: t(this.print.outRelief, false),
      ins: t(this.print.inColour, true),
      sticker: t(this.print.sticker, true),
    };
    this.outer = new MeshPhysicalMaterial({
      map: this.tex.col,
      roughnessMap: this.tex.fin,
      metalnessMap: this.tex.fin,
      roughness: 1,
      metalness: 1,
      bumpMap: this.tex.rel,
      bumpScale: 0.9,
      envMapIntensity: 0.9,
    });
    this.inner = new MeshStandardMaterial({ map: this.tex.ins, roughness: 0.88, metalness: 0, envMapIntensity: 0.7 });
    this.edge = new MeshStandardMaterial({ color: '#bf9b6c', roughness: 0.95, metalness: 0 });
    this.tissueMat = new MeshPhysicalMaterial({ color: '#19b5a8', roughness: 0.92, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new Color('#ffffff'), side: DoubleSide, envMapIntensity: 0.45 });
  }

  async init() {
    await Promise.all([document.fonts.load('700 40px Philosopher'), document.fonts.load('40px "Imperial Script"'), document.fonts.load('600 20px "Source Sans 3"')]).catch(() => {});
    this.applyDesign();
    await nextTask();
    // the sheet, panel by panel, each hanging from its parent at its crease
    const byId = new Map(panels.map((p) => [p.id, p]));
    for (const p of panels) {
      const geo = this.panelGeometry(p);
      const mesh = new Mesh(geo, [this.inner, this.outer, this.edge]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = p.id;
      mesh.position.set(-p.pivot[0], -p.pivot[1], -p.pivot[2]);
      const group = new Object3D();
      const pp = p.parent ? byId.get(p.parent)!.pivot : [0, 0, 0];
      group.position.set(p.pivot[0] - pp[0], p.pivot[1] - pp[1], p.pivot[2] - pp[2]);
      group.add(mesh);
      (p.parent ? this.hinges.get(p.parent)!.group : this.box).add(group);
      this.hinges.set(p.id, { spec: p, group, mesh, axis: new Vector3(...p.axis), angle: 0, vel: 0, from: 0 });
    }
    this.buildTissue();
    this.scene.add(this.box);
    await nextTask();
    this.box.rotation.y = this.yaw;

    // the studio: soft room light, a key from the upper left with a soft shadow, a rim from behind
    // the room's light, ready-made (building it here would stall the page)
    this.scene.environment = await studioEnvironment();
    const key = new DirectionalLight('#fff6ea', 2.1);
    key.position.set(-0.9, 1.6, 0.9);
    key.target.position.set(0, 0, -0.08);
    key.castShadow = true;
    const q = this.opts.quality === 'hi' ? 2048 : 1024;
    key.shadow.mapSize.set(q, q);
    const s = key.shadow.camera;
    s.left = -0.42;
    s.right = 0.42;
    s.top = 0.42;
    s.bottom = -0.42;
    s.near = 0.5;
    s.far = 3.5;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.01;
    key.shadow.radius = 5;
    this.scene.add(key, key.target);
    this.scene.add(new HemisphereLight('#fffaf2', '#bdb6a6', 0.35));
    const rim = new DirectionalLight('#ffffff', 0.8);
    rim.position.set(0.8, 0.9, -1.2);
    this.scene.add(rim);
    const floor = new Mesh(new PlaneGeometry(4, 4), new ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.0002;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.resize();
    this.bind();
    this.update(0);
    // the shaders compile alongside the page, the pictures go up one per task, then the first frame
    await nextTask();
    await compileInSteps(this.renderer, this.scene, this.camera);
    await uploadTextures(this.renderer, this.scene, [this.scene.environment]);
    this.renderer.render(this.scene, this.camera);
    this.opts.onReady?.();
    this.opts.onState?.(this.state);
  }

  /** a panel: its inside face (up), outside face (down) and cut edges, in the sheet's coordinates */
  private panelGeometry(p: Panel) {
    const pts = p.outline;
    const n = pts.length;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const geo = new BufferGeometry();
    // which way round the outline goes (seen from above)
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % n];
      area += x0 * z1 - x1 * z0;
    }
    // a fan (a, b, c) faces up when (b - a) x (c - a) has y > 0, i.e. when the outline runs clockwise in x-z
    const upFan = area < 0;
    const face = (y: number, ny: number, side: 'in' | 'out') => {
      const start = index.length;
      const base = pos.length / 3;
      for (const [x, z] of pts) {
        pos.push(x, y, z);
        nor.push(0, ny, 0);
        uv.push(...this.print.uv(p, side, x, z));
      }
      const facesUp = ny > 0;
      for (let i = 1; i < n - 1; i++) {
        if (upFan === facesUp) index.push(base, base + i, base + i + 1);
        else index.push(base, base + i + 1, base + i);
      }
      return [start, index.length - start] as const;
    };
    const top = face(T, 1, 'in');
    const bottom = face(0, -1, 'out');
    // the cut edges
    const start = index.length;
    let cx = 0, cz = 0;
    for (const [x, z] of pts) {
      cx += x / n;
      cz += z / n;
    }
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % n];
      let nx = bz - az;
      let nz = -(bx - ax);
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) {
        nx = -nx;
        nz = -nz;
      }
      const b = pos.length / 3;
      pos.push(ax, 0, az, bx, 0, bz, bx, T, bz, ax, T, az);
      for (let k = 0; k < 4; k++) {
        nor.push(nx, 0, nz);
        uv.push(0, 0);
      }
      // (b0, b1, b2): its normal is (b1 - b0) x (b2 - b0) = (d, 0) x (0, T, 0) ∝ (-dz, 0, dx)·T ... compare with n
      const ex = bx - ax;
      const ez = bz - az;
      const out = -ez * nx + ex * nz; // the y-up cross product's x-z part, dotted with the outward normal
      if (out > 0) index.push(b, b + 1, b + 2, b, b + 2, b + 3);
      else index.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setIndex(index);
    geo.addGroup(top[0], top[1], 0);
    geo.addGroup(bottom[0], bottom[1], 1);
    geo.addGroup(start, index.length - start, 2);
    return geo;
  }

  /** tissue paper folded over a gift, two sheets meeting in the middle under a seal */
  private buildTissue() {
    const x0 = -W / 2 + T + 0.003;
    const x1 = W / 2 - T - 0.003;
    const z0 = -D / 2 + T + 0.003;
    const z1 = D / 2 - T - 0.003;
    const gift = (x: number, z: number) => {
      // a soft box shape under the tissue: 15 x 10 cm, 3.6 cm high
      const sx = 1 - ease((Math.abs(x) - 0.06) / 0.035);
      const sz = 1 - ease((Math.abs(z) - 0.035) / 0.03);
      return 0.036 * sx * sz;
    };
    const wrinkle = (x: number, z: number, seed: number) => {
      let h = 0;
      for (let i = 0; i < 6; i++) {
        const a = seed * 1.7 + i * 2.39996;
        const f = 38 + i * 21;
        h += Math.sin((x * Math.cos(a) + z * Math.sin(a)) * f + seed * 3.1 + i) * (0.0011 / (1 + i * 0.5));
      }
      return h;
    };
    const sheetMesh = (sx0: number, sx1: number, lift: number, seed: number, foldEdge: 'left' | 'right') => {
      const nx = 36;
      const nz = 26;
      const geo = new PlaneGeometry(sx1 - sx0, z1 - z0, nx, nz);
      geo.rotateX(-Math.PI / 2);
      geo.translate((sx0 + sx1) / 2, 0, (z0 + z1) / 2);
      const p = geo.attributes.position as BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        // tucked down along the walls, a rolled edge where the sheet folds over
        const wall = Math.min(x - x0, x1 - x, z - z0, z1 - z);
        const tuck = 0.012 * (1 - ease(wall / 0.03));
        const edge = foldEdge === 'left' ? x - sx0 : sx1 - x;
        const roll = 0.0035 * (1 - ease(edge / 0.008));
        p.setY(i, 0.004 + lift + gift(x, z) + tuck + roll + wrinkle(x, z, seed) * (0.6 + gift(x, z) * 12));
      }
      geo.computeVertexNormals();
      const m = new Mesh(geo, this.tissueMat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    this.tissue.add(sheetMesh(x0, 0.03, 0, 1, 'right'));
    this.tissue.add(sheetMesh(-0.03, x1, 0.0016, 2, 'left'));
    const seal = new Mesh(
      new CircleGeometry(0.02, 48),
      new MeshPhysicalMaterial({ map: this.tex.sticker, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3, transparent: true }),
    );
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(-0.03, 0.004 + 0.0016 + gift(-0.03, 0) + 0.0016, 0);
    seal.castShadow = true;
    this.tissue.add(seal);
    this.tissue.position.y = this.tissueY;
    this.tissue.visible = false;
    this.hinges.get('base')!.group.add(this.tissue);
  }

  private applyDesign() {
    const f = FINISHES[this.design.finish];
    this.print.draw(this.design);
    for (const t of Object.values(this.tex)) t.needsUpdate = true;
    // never quite zero: switching a layer on or off rebuilds the shader (a stutter on a phone)
    this.outer.clearcoat = Math.max(0.001, f.clearcoat);
    this.outer.clearcoatRoughness = 0.18;
    this.outer.sheen = Math.max(0.001, f.sheen);
    this.outer.sheenRoughness = 0.6;
    this.outer.sheenColor.set('#ffffff');
    this.outer.bumpScale = f.kraftFibres ? 1.4 : 0.8;
    this.edge.color.set(f.edge);
    this.tissueMat.color.set(f.tissue);
    this.dirty = true;
  }

  setDesign(d: Partial<BoxDesign>) {
    this.design = { ...this.design, ...d };
    this.applyDesign();
  }

  get current() {
    return this.design;
  }

  /** fold the sheet into the box (true) or open it back out flat (false) */
  setFolded(on: boolean) {
    if (on === (this.foldTo === 1)) return;
    this.foldTo = on ? 1 : 0;
    this.grab = null;
    this.hand = null;
    if (!on) for (const h of this.hinges.values()) h.from = h.angle;
    this.dirty = true;
  }

  get folded() {
    return this.foldTo === 1;
  }

  get isOpen() {
    return this.lid.a < 0.9;
  }

  /** open or close the lid (by hand, for the buttons and a tap) */
  toggleLid() {
    if (this.fold < 1) return;
    this.hand = { target: this.isOpen ? 1.2 : -0.75, until: this.time + 0.45 };
    this.dirty = true;
  }

  resize() {
    const c = this.opts.canvas;
    const w = c.clientWidth || 1;
    const h = c.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private setPointer(e: PointerEvent) {
    const r = this.opts.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit() {
    this.ray.setFromCamera(this.pointer, this.camera);
    const meshes = [...this.hinges.values()].map((h) => h.mesh);
    return this.ray.intersectObjects(meshes, false)[0] ?? null;
  }

  /** the lid's angle that puts a point (world) on its arc: measured in the back wall's frame */
  private lidAngleAt(world: Vector3) {
    const back = this.hinges.get('back')!.group;
    const lid = this.hinges.get('lid')!.group;
    const local = back.worldToLocal(world.clone());
    const d = local.sub(lid.position);
    return Math.atan2(d.y, -d.z);
  }

  private bind() {
    const c = this.opts.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.setPointer(e);
      const h = this.hit();
      const id = h?.object.userData.id as string | undefined;
      const onLid = !!id && LID_PARTS.has(id) && this.fold >= 1 && this.foldTo === 1;
      this.press = { x: e.clientX, y: e.clientY, t: performance.now(), onLid };
      c.setPointerCapture(e.pointerId);
      if (onLid && h) {
        // the lid turns about its crease: drag the point you hold round that crease
        const back = this.hinges.get('back')!.group;
        const axis = new Vector3(1, 0, 0).transformDirection(back.matrixWorld);
        const at = this.lidAngleAt(h.point);
        this.grab = { plane: new Plane().setFromNormalAndCoplanarPoint(axis, h.point), offset: this.lid.a - at, target: this.lid.a };
        this.hand = null;
      } else {
        this.turning = { x: e.clientX, yaw: this.yaw, moved: false };
      }
      this.dirty = true;
    });
    c.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      if (this.grab) {
        this.ray.setFromCamera(this.pointer, this.camera);
        const p = new Vector3();
        if (this.ray.ray.intersectPlane(this.grab.plane, p)) this.grab.target = this.lidAngleAt(p) + this.grab.offset;
        this.dirty = true;
      } else if (this.turning) {
        const dx = e.clientX - this.turning.x;
        if (Math.abs(dx) > 4) this.turning.moved = true;
        const yaw = this.turning.yaw + (dx / c.clientWidth) * Math.PI * 1.6;
        this.yawVel = yaw - this.yaw;
        this.yaw = yaw;
        this.dirty = true;
      } else if (e.pointerType === 'mouse') {
        const h = this.hit();
        const id = h?.object.userData.id as string | undefined;
        const on = !h ? null : id && LID_PARTS.has(id) && this.fold >= 1 ? 'lid' : 'box';
        if (on !== this.hovering) {
          this.hovering = on;
          this.onHover?.(on);
        }
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.press;
      // a tap (not a drag): on the lid it opens or closes it, on the sheet it folds it
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6 && performance.now() - p.t < 350) {
        if (p.onLid) {
          this.grab = null;
          this.toggleLid();
        } else if (this.foldTo === 0 && this.hit()) this.setFolded(true);
      }
      this.press = null;
      this.grab = null;
      this.turning = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (this.hovering) {
        this.hovering = null;
        this.onHover?.(null);
      }
    });
    new IntersectionObserver(([en]) => {
      this.visible = en.isIntersecting;
      this.dirty = true;
    }, { rootMargin: '10%' }).observe(c);
  }

  private setState(s: BoxState) {
    if (s === this.state) return;
    this.state = s;
    this.opts.onState?.(s);
  }

  /** advance the fold, the creases, the lid and the tissue; true while anything moves */
  private update(dt: number): boolean {
    let moving = false;
    // the fold runs at its own pace (2.6 s for the whole sheet)
    if (this.fold !== this.foldTo) {
      this.fold = this.foldTo > this.fold ? Math.min(this.foldTo, this.fold + dt / 2.6) : Math.max(this.foldTo, this.fold - dt / 2.2);
      moving = true;
    }
    const built = this.fold >= 1 && this.foldTo === 1;
    const lidHinge = this.hinges.get('lid')!;
    if (built && this.state !== 'closed' && this.state !== 'open') this.lid = { a: lidHinge.angle, w: lidHinge.vel };
    // fixed small steps: the springs and the lid stay stable whatever the frame rate
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const hinge of this.hinges.values()) {
        const p = hinge.spec;
        if (!p.parent) continue;
        if (built && p.id === 'lid') continue;
        let target: number;
        if (built && LID_PARTS.has(p.id)) {
          // the tuck and the lid's flaps fold in as the lid comes down, and relax (the board's memory) when it opens
          const closing = this.lid.a > (p.id === 'tuck' ? 1.15 : 0.95);
          target = closing ? p.folded : p.folded * (p.id === 'tuck' ? 0.3 : 0.42);
        } else {
          const k = ease(clamp01((this.fold - p.window[0]) / (p.window[1] - p.window[0])));
          target = (this.foldTo === 1 ? p.folded : hinge.from) * k;
        }
        // a stiff crease with a little give: slightly under-damped
        const acc = 300 * (target - hinge.angle) - 2 * Math.sqrt(300) * 0.62 * hinge.vel;
        hinge.vel += acc * h;
        hinge.angle += hinge.vel * h;
      }
      if (built) this.stepLid(h);
    }
    if (built) {
      lidHinge.angle = this.lid.a;
      lidHinge.vel = this.lid.w;
    }
    for (const hinge of this.hinges.values()) {
      if (!hinge.spec.parent) continue;
      hinge.group.quaternion.setFromAxisAngle(hinge.axis, hinge.angle);
      if (Math.abs(hinge.vel) > 1e-3) moving = true;
    }
    // the tissue drops in once the walls are up, and lifts out before they go down
    const wantIn = this.fold > 0.5 && this.foldTo === 1 ? 0 : 0.45;
    if (wantIn === 0 && this.tissueY > 0) {
      this.tissueV -= 9.81 * dt;
      this.tissueY += this.tissueV * dt;
      if (this.tissueY <= 0) {
        this.tissueY = 0;
        this.tissueV = Math.abs(this.tissueV) > 0.25 ? -this.tissueV * 0.22 : 0;
      }
      moving = true;
    } else if (wantIn > 0 && this.tissueY < wantIn) {
      this.tissueY = Math.min(wantIn, this.tissueY + dt * 1.6);
      this.tissueV = 0;
      moving = true;
    } else if (this.tissueV !== 0) {
      this.tissueY = Math.max(0, this.tissueY + this.tissueV * dt);
      this.tissueV -= 9.81 * dt;
      if (this.tissueY <= 0) this.tissueV = 0;
      moving = true;
    }
    this.tissue.position.y = this.tissueY;
    this.tissue.visible = this.tissueY < 0.44;
    // turning: inertia after a drag
    if (!this.turning && Math.abs(this.yawVel) > 1e-5) {
      this.yawVel *= 0.9;
      this.yaw += this.yawVel;
      moving = true;
    }
    this.box.rotation.y = this.yaw;
    // the state, for the caption and the buttons
    if (!built) this.setState(this.foldTo === 1 ? (this.fold > 0 ? 'folding' : 'flat') : this.fold > 0 ? 'unfolding' : 'flat');
    else this.setState(this.lid.a < 0.9 ? 'open' : 'closed');
    this.place();
    return moving;
  }

  /** the lid about its crease: gravity, the crease's memory, the magnet, the walls and the table */
  private stepLid(h: number) {
    const L = this.lid;
    if (this.hand && this.time > this.hand.until) this.hand = null;
    const target = this.grab?.target ?? this.hand?.target;
    let acc: number;
    if (target !== undefined) {
      // held: it follows the hand through a soft grip
      acc = 700 * (target - L.a) - 2 * Math.sqrt(700) * 0.85 * L.w;
    } else {
      const gravity = ((3 * 9.81) / (2 * LID_LENGTH)) * Math.sin(L.a);
      // the crease remembers being flat; bent back against its score it pushes much harder, so an open lid
      // comes to rest leaning back (about 35 degrees past upright) instead of falling flat
      const memory = (L.a < 0 ? 80 : 6) * (0 - L.a);
      const magnet = L.a > LID_CLOSED - 0.14 ? 160 : 0;
      acc = gravity + memory + magnet - 1.1 * L.w;
    }
    L.w += acc * h;
    L.a += L.w * h;
    if (L.a > LID_CLOSED) {
      L.a = LID_CLOSED;
      if (L.w > 0) L.w = L.w > 1.2 ? -L.w * 0.2 : 0;
    }
    if (L.a < LID_OPEN_LIMIT) {
      L.a = LID_OPEN_LIMIT;
      if (L.w < 0) L.w = L.w < -1 ? -L.w * 0.25 : 0;
    }
  }

  /** the camera: high over the flat sheet, lower and closer round the box; looking in when the lid is up */
  private place() {
    const k = ease(clamp01(this.fold * 1.15));
    const open = this.fold >= 1 ? clamp01((LID_CLOSED - this.lid.a) / 1.6) : 0;
    const flatCentre = new Vector3(0, 0, (sheet.z0 + sheet.z1) / 2);
    // open, the lid stands leaning back: frame the box and the lid together, and look a little more into it
    const boxCentre = new Vector3(0, 0.04 + open * 0.07, -open * 0.05);
    const target = flatCentre.lerp(boxCentre, k);
    const radius = 0.36 + (0.2 + open * 0.05 - 0.36) * k;
    const pitch = 1.02 + (0.42 + open * 0.12 - 1.02) * k;
    const cam = this.camera;
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.98;
    cam.position.set(target.x, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    cam.lookAt(target);
  }

  frame(dt: number) {
    if (!this.hinges.size) return;
    this.time += dt;
    const moving = this.update(Math.min(dt, 1 / 20));
    if (!this.visible) return;
    if (moving || this.dirty || this.grab || this.turning) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  dispose() {
    this.renderer.dispose();
  }
}
