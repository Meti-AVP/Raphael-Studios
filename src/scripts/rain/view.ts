// "Summer, branded": the giveaways rain onto the sand and pile up, each printed with the reader's brand. Pick one
// up and throw it, shake the pile, ask for more. The physics (./physics) runs on the page's own frame; once
// everything is still, nothing more is computed or drawn until something moves again.
import {
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { compileInSteps, nextTask, studioEnvironment, uploadTextures } from '../core/studio-env';
import { Body, World } from './physics';
import { KINDS, Prints, type Brand } from './items';

export interface RainViewOptions {
  canvas: HTMLCanvasElement;
  quality: 'hi' | 'lo';
  onReady?: () => void;
}

interface Item {
  body: Body;
  object: Object3D;
  born: number;
  leaving: number | null;
}

const MAX_ITEMS = 30;
const TARGET = new Vector3(0, 0.04, 0.03);

export class RainView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.05, 20);
  private world = new World({ floor: 0, x: 0.6, z: 0.36 });
  private prints = new Prints();
  private items: Item[] = [];
  /** one model per kind (its textures and materials shared by every copy) */
  private templates = new Map<number, ReturnType<(typeof KINDS)[number]['build']>>();
  private warm: Group | null = null;
  private queue: { kind: number; at: number }[] = [];
  private order: number[] = [];
  private next = 0;
  /** the kinds the reader keeps in the set (all of them at first); only those fall */
  private kept = new Set(KINDS.map((k) => k.id));
  private time = 0;
  private dirty = true;
  private visible = true;
  private pointer = new Vector2();
  private ray = new Raycaster();
  private held: { item: Item; plane: Plane } | null = null;
  hovering = false;
  onHover: ((on: boolean) => void) | null = null;

  constructor(private opts: RainViewOptions) {
    const r = new WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'hi' ? 2 : 1.5));
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap; // soft through each light's shadow radius (PCFSoft is gone: it would recompile every material)
    r.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer = r;
    if (opts.quality === 'lo') this.world.substeps = 8;
  }

  async init() {
    await document.fonts.load('700 40px Philosopher').catch(() => {});
    // the sand: fine grains and soft ripples, fading into the page at its edges
    const sand = document.createElement('canvas');
    sand.width = sand.height = 512;
    const x = sand.getContext('2d')!;
    x.fillStyle = '#e6d3ad';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9; i++) {
      x.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.02})`;
      x.beginPath();
      for (let px = 0; px <= 512; px += 8) x.lineTo(px, i * 57 + Math.sin(px * 0.025 + i) * 9);
      x.lineTo(512, i * 57 + 14);
      x.lineTo(0, i * 57 + 14);
      x.fill();
    }
    // the grains: a little darker or lighter, pixel by pixel (one pass over the picture)
    const img = x.getImageData(0, 0, 512, 512);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.random();
      const k = g < 0.1 ? -18 * Math.random() : g > 0.9 ? 16 * Math.random() : (Math.random() - 0.5) * 6;
      d[i] += k;
      d[i + 1] += k;
      d[i + 2] += k * 0.8;
    }
    x.putImageData(img, 0, 0);
    const sandTex = new CanvasTexture(sand);
    sandTex.colorSpace = SRGBColorSpace;
    sandTex.wrapS = sandTex.wrapT = RepeatWrapping;
    sandTex.repeat.set(3, 3);
    sandTex.anisotropy = 8;
    const fade = document.createElement('canvas');
    fade.width = fade.height = 256;
    const f = fade.getContext('2d')!;
    const g = f.createRadialGradient(128, 128, 40, 128, 128, 128);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.75, '#bbb');
    g.addColorStop(1, '#000');
    f.fillStyle = g;
    f.fillRect(0, 0, 256, 256);
    const floor = new Mesh(
      new PlaneGeometry(2.4, 1.6),
      new MeshStandardMaterial({ map: sandTex, alphaMap: new CanvasTexture(fade), transparent: true, roughness: 1, depthWrite: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    await nextTask();

    // a summer sun from the upper left, the sky and the sand's warm bounce, the room for the glossy things
    // the room's light, ready-made (building it here would stall the page)
    this.scene.environment = await studioEnvironment();
    this.scene.environmentIntensity = 0.55;
    const sun = new DirectionalLight('#fff1d6', 2.6);
    sun.position.set(-1.6, 3.2, 1.4);
    sun.castShadow = true;
    const q = this.opts.quality === 'hi' ? 2048 : 1024;
    sun.shadow.mapSize.set(q, q);
    const s = sun.shadow.camera;
    s.left = -1;
    s.right = 1;
    s.top = 1;
    s.bottom = -1;
    s.near = 1;
    s.far = 7;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.008;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    this.scene.add(new HemisphereLight('#dff1ff', '#e9d2a6', 0.7));

    // every kind's model now, while nothing is on screen: their materials compile with the rest, not mid-rain
    const warm = new Group();
    KINDS.forEach((k, i) => {
      const t = k.build(this.prints);
      this.templates.set(i, t);
      warm.add(t.object);
    });
    warm.visible = false;
    this.scene.add(warm);
    this.warm = warm;
    await nextTask();

    // the order the things come in: every kind, shuffled, again and again
    for (let r = 0; r < 4; r++) {
      const kinds = KINDS.map((_, i) => i).sort(() => Math.random() - 0.5);
      this.order.push(...kinds);
    }

    this.resize();
    this.bind();
    this.place();
    // the shaders compile alongside the page, the pictures go up one per task, then the first frame
    await nextTask();
    await compileInSteps(this.renderer, this.scene, this.camera);
    await uploadTextures(this.renderer, this.scene, [this.scene.environment]);
    // the models served their turn: copies of them will fall
    this.scene.remove(this.warm!);
    this.renderer.render(this.scene, this.camera);
    this.opts.onReady?.();
  }

  setBrand(b: Partial<Brand>) {
    this.prints.setBrand(b);
    this.dirty = true;
  }

  /** which kinds are in the set (by id): the next ones to fall are only those */
  keep(ids: string[]) {
    this.kept = new Set(ids);
  }

  /** more things, falling from above the view one after another (of the kinds kept) */
  rain(count: number) {
    if (!this.kept.size) return;
    for (let i = 0; i < count; i++) {
      let kind = this.order[this.next % this.order.length];
      for (let k = 0; k < this.order.length && !this.kept.has(KINDS[kind].id); k++) kind = this.order[++this.next % this.order.length];
      this.queue.push({ kind, at: this.time + i * 0.11 });
      this.next++;
    }
    this.world.wake();
  }

  /** a shake from below: everything jumps and turns */
  shake() {
    for (const it of this.items) {
      it.body.v.add(new Vector3((Math.random() - 0.5) * 0.8, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6));
      it.body.w.add(new Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14));
    }
    this.world.wake();
  }

  get count() {
    return this.items.length;
  }

  private spawn(kind: number) {
    let t = this.templates.get(kind);
    if (!t) {
      t = KINDS[kind].build(this.prints);
      this.templates.set(kind, t);
    }
    const object = t.object.clone(true);
    const body = new Body(t.body);
    body.x.set((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
    body.q.setFromAxisAngle(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), Math.random() * Math.PI * 2);
    body.v.set((Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.8, (Math.random() - 0.5) * 0.3);
    body.w.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    const item: Item = { body, object, born: this.time, leaving: null };
    object.traverse((o) => (o.userData.item = item));
    this.scene.add(object);
    this.world.add(body);
    this.items.push(item);
    // too many: the oldest that nobody holds shrinks away
    const live = this.items.filter((i) => i.leaving === null);
    if (live.length > MAX_ITEMS) {
      const old = live.find((i) => i !== this.held?.item);
      if (old) old.leaving = this.time;
    }
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

  private place() {
    // high over the sand, looking down at about 50 degrees, the whole 1.2 x 0.7 m in view
    const cam = this.camera;
    const vfov = (cam.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const dist = 0.66 / Math.sin(Math.min(vfov, hfov * 0.8) / 2);
    const pitch = 0.9;
    cam.position.set(TARGET.x, TARGET.y + Math.sin(pitch) * dist, TARGET.z + Math.cos(pitch) * dist);
    cam.lookAt(TARGET);
  }

  private setPointer(e: PointerEvent) {
    const r = this.opts.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick(): { item: Item; point: Vector3 } | null {
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects(this.items.map((i) => i.object), true)[0];
    const item = hit?.object.userData.item as Item | undefined;
    return item && hit ? { item, point: hit.point } : null;
  }

  private bind() {
    const c = this.opts.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.setPointer(e);
      const p = this.pick();
      if (!p) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const b = p.item.body;
      // the grabbed point, in the body's own frame; it is pulled within a plane facing the camera
      const local = p.point.clone().sub(b.x).applyQuaternion(b.q.clone().invert());
      const normal = new Vector3();
      this.camera.getWorldDirection(normal);
      b.hold = { local, target: p.point.clone() };
      this.held = { item: p.item, plane: new Plane().setFromNormalAndCoplanarPoint(normal, p.point) };
      this.world.wake();
    });
    c.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      if (this.held) {
        this.ray.setFromCamera(this.pointer, this.camera);
        const t = new Vector3();
        if (this.ray.ray.intersectPlane(this.held.plane, t)) {
          // not through the sand
          t.y = Math.max(0.03, t.y);
          this.held.item.body.hold!.target.copy(t);
        }
        this.world.wake();
      } else if (e.pointerType === 'mouse') {
        const on = !!this.pick();
        if (on !== this.hovering) {
          this.hovering = on;
          this.onHover?.(on);
        }
      }
    });
    const drop = () => {
      if (this.held) this.held.item.body.hold = null;
      this.held = null;
      this.world.wake();
    };
    c.addEventListener('pointerup', drop);
    c.addEventListener('pointercancel', drop);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.dirty = true;
    }, { rootMargin: '10%' }).observe(c);
  }

  frame(dt: number) {
    if (!this.visible) return;
    this.time += dt;
    // things whose turn has come
    while (this.queue.length && this.queue[0].at <= this.time) this.spawn(this.queue.shift()!.kind);
    let changed = this.dirty;
    if (this.world.step(dt)) changed = true;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.object.position.copy(it.body.x);
      it.object.quaternion.copy(it.body.q);
      if (it.leaving !== null) {
        const k = Math.max(0, 1 - (this.time - it.leaving) / 0.5);
        it.object.scale.setScalar(k);
        changed = true;
        if (k === 0) {
          this.scene.remove(it.object);
          this.world.remove(it.body);
          this.items.splice(i, 1);
        }
      }
    }
    if (!changed && !this.queue.length) return;
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  dispose() {
    this.renderer.dispose();
  }
}
