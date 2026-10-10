// "Drawn, then rendered": the kiosk on screen twice at once, split by a line you move. Left of the line the
// blueprint (edges with the hidden lines removed, dimensions, on the drawing's grid, which is the page behind a
// transparent canvas); right of it the render (materials, soft shadows, the room's reflections). One scene, two
// passes with a scissor; the shadows are worked out once (nothing in the kiosk moves), and a frame is only drawn
// when something changed.
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { compileInSteps, nextTask, studioEnvironment, uploadTextures } from '../core/studio-env';
import { Kiosk, LAYER_BLUEPRINT, type Brand } from './kiosk';

const LAYER_RENDER = 2;
const TARGET = new Vector3(0, 1.26, 0);

export interface VizViewOptions {
  canvas: HTMLCanvasElement;
  quality: 'hi' | 'lo';
  onReady?: () => void;
}

export class VizView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.1, 40);
  private kiosk!: Kiosk;
  private face = new MeshBasicMaterial({ color: '#0f4a45', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  private meshes: { mesh: Mesh; material: Material | Material[]; decal: boolean }[] = [];
  /** where the render starts, from the left (0..1) */
  split = 0.42;
  private yaw = 0.42;
  private pitch = 0.16;
  private yawVel = 0;
  private pitchVel = 0;
  private turning: { x: number; y: number; yaw: number; pitch: number } | null = null;
  private dirty = true;
  private visible = true;
  private dist = 6;

  constructor(private opts: VizViewOptions) {
    const r = new WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'hi' ? 2 : 1.5));
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap; // soft through each light's shadow radius (PCFSoft is gone: it would recompile every material)
    r.shadowMap.autoUpdate = false;
    r.debug.checkShaderErrors = import.meta.env.DEV;
    r.setClearColor(new Color(0x000000), 0);
    this.renderer = r;
  }

  async init() {
    await Promise.all([document.fonts.load('700 40px Philosopher'), document.fonts.load('600 20px "Source Sans 3"')]).catch(() => {});
    this.kiosk = new Kiosk();
    this.scene.add(this.kiosk.group);
    await nextTask();
    this.kiosk.group.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      // the lit faces (lightbox, letters, prints, the light strip) are not part of the drawing
      this.meshes.push({ mesh: o, material: o.material, decal: o.userData.decal === true });
    });
    // the room: soft light all round, a key from the front left with a soft shadow on the floor, a cool rim
    // the room's light, ready-made (building it here would stall the page)
    this.scene.environment = await studioEnvironment();
    const key = new DirectionalLight('#fff4e6', 2.2);
    key.position.set(-3.2, 5.2, 4.2);
    key.target.position.set(0, 0.8, -0.2);
    key.castShadow = true;
    const q = this.opts.quality === 'hi' ? 2048 : 1024;
    key.shadow.mapSize.set(q, q);
    const s = key.shadow.camera;
    s.left = -2.2;
    s.right = 2.2;
    s.top = 2.6;
    s.bottom = -2;
    s.near = 1;
    s.far = 14;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);
    this.scene.add(new HemisphereLight('#fffaf2', '#a9a291', 0.45));
    const rim = new DirectionalLight('#dff4ff', 0.7);
    rim.position.set(3, 3, -3);
    this.scene.add(rim);
    const floor = new Mesh(new PlaneGeometry(14, 14), new ShadowMaterial({ opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.layers.set(LAYER_RENDER);
    this.scene.add(floor);
    this.renderer.shadowMap.needsUpdate = true;

    this.resize();
    this.bind();
    this.place();
    this.camera.layers.enableAll();
    // the shaders compile alongside the page, the pictures go up one per task, then the first frame
    await nextTask();
    await compileInSteps(this.renderer, this.scene, this.camera);
    await uploadTextures(this.renderer, this.scene, [this.scene.environment]);
    this.draw();
    this.opts.onReady?.();
  }

  setBrand(b: Partial<Brand>) {
    this.kiosk.setBrand(b);
    this.dirty = true;
  }

  setSplit(f: number) {
    this.split = Math.max(0, Math.min(1, f));
    this.dirty = true;
  }

  resize() {
    const c = this.opts.canvas;
    const w = c.clientWidth || 1;
    const h = c.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // fit the kiosk: a sphere of about 2 m round its middle (2.4 m wide, 2.7 m high with its lights)
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    this.dist = 1.95 / Math.sin(Math.min(vfov, hfov) / 2);
    this.dirty = true;
  }

  private bind() {
    const c = this.opts.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.turning = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.turning) return;
      const yaw = this.turning.yaw - ((e.clientX - this.turning.x) / c.clientWidth) * Math.PI * 1.2;
      const pitch = this.turning.pitch + ((e.clientY - this.turning.y) / c.clientHeight) * 0.9;
      this.yawVel = yaw - this.yaw;
      this.pitchVel = pitch - this.pitch;
      this.yaw = yaw;
      this.pitch = pitch;
      this.clamp();
      this.dirty = true;
    });
    const end = () => (this.turning = null);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.dirty = true;
    }, { rootMargin: '10%' }).observe(c);
  }

  private clamp() {
    this.yaw = Math.max(-1.15, Math.min(1.15, this.yaw));
    this.pitch = Math.max(0.02, Math.min(0.62, this.pitch));
  }

  private place() {
    const cam = this.camera;
    const d = this.dist;
    cam.position.set(TARGET.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d, TARGET.y + Math.sin(this.pitch) * d, TARGET.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    cam.lookAt(TARGET);
  }

  /** the two passes: the drawing left of the line, the render right of it */
  private draw() {
    const r = this.renderer;
    const c = this.opts.canvas;
    const w = c.clientWidth;
    const h = c.clientHeight;
    const sx = Math.round(w * this.split);
    r.setScissorTest(true);
    if (sx > 0) {
      for (const m of this.meshes) {
        m.mesh.material = this.face;
        m.mesh.visible = !m.decal;
      }
      this.camera.layers.set(0);
      this.camera.layers.enable(LAYER_BLUEPRINT);
      r.setScissor(0, 0, sx, h);
      r.render(this.scene, this.camera);
      for (const m of this.meshes) {
        m.mesh.material = m.material;
        m.mesh.visible = true;
      }
    }
    if (sx < w) {
      this.camera.layers.set(0);
      this.camera.layers.enable(LAYER_RENDER);
      r.setScissor(sx, 0, w - sx, h);
      r.render(this.scene, this.camera);
    }
    r.setScissorTest(false);
  }

  frame() {
    if (!this.kiosk) return;
    if (!this.turning && (Math.abs(this.yawVel) > 1e-5 || Math.abs(this.pitchVel) > 1e-5)) {
      this.yawVel *= 0.9;
      this.pitchVel *= 0.85;
      this.yaw += this.yawVel;
      this.pitch += this.pitchVel;
      this.clamp();
      this.dirty = true;
    }
    if (!this.visible || !this.dirty) return;
    this.place();
    this.draw();
    this.dirty = false;
  }

  dispose() {
    this.renderer.dispose();
  }
}
