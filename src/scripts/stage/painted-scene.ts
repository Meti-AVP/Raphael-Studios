// One painted scene: its models and backdrop, its camera, its timeline. Loads lazily, renders into a target that the
// compositor mixes with the neighbouring scene.
//
// Modes: 'poster' (the still painting, a cover-fitted picture: phones that should not run 3D, and the moments before
// the models arrive) and '3d' (the living painting). A scene starts as a poster and switches when its models are ready.
import {
  AnimationMixer,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LoopRepeat,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type AnimationAction,
  type WebGLRenderer,
  type WebGLRenderTarget,
  Box3,
  Quaternion,
  Euler,
} from 'three';
import { gltfLoader, ktx2Loader } from './loaders';
import { convert, painted, type SceneMaterial } from './materials';
import { Timeline, type TimelineData } from './timeline';

export interface SceneManifest {
  id: string;
  camera: string | null;
  assets: { key: string; kind: 'glb' | 'plane'; url: string; width?: number; height?: number }[];
  posters: { desktop: { url: string; width: number; height: number }; mobile: { url: string; width: number; height: number } };
  /** live screens laid over a painted model's screen: a canvas drawn by stage/screens/<id>.ts, by scroll progress */
  screens?: { id: string; node: string; corners: number[][]; from: number; to: number; push?: number }[];
}

interface ScreenRuntime {
  tex: CanvasTexture;
  draw: (p: number) => void;
  from: number;
  to: number;
  last: number;
}

const screenModules: Record<string, () => Promise<{ createScreen: (base: string) => { canvas: HTMLCanvasElement; ready: Promise<void>; draw: (p: number) => void } }>> = {
  editor: () => import('./screens/editor'),
};

export interface Shared {
  mud: Texture;
  env: Texture | null;
}

interface AssetRuntime {
  key: string;
  root: Object3D;
  materials: SceneMaterial[];
  mixer: AnimationMixer | null;
  actions: Map<string, { action: AnimationAction; duration: number }>;
  bornAt: number;
}

// Safari before 17 and Firefox before 98 ignore the bitmap options (the pictures would come out upside down): as GLTFLoader
const bitmapsWork = (() => {
  if (typeof createImageBitmap === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/^((?!chrome|android).)*safari/i.test(ua)) return Number(ua.match(/Version\/(\d+)/)?.[1] ?? 0) >= 17;
  if (ua.includes('Firefox')) return Number(ua.match(/Firefox\/(\d+)/)?.[1] ?? 0) >= 98;
  return true;
})();

/** a picture as a texture, decoded off the main thread (flipped at decode: bitmaps ignore the upload flip) */
export async function loadBitmapTexture(url: string): Promise<Texture> {
  if (!bitmapsWork) return new TextureLoader().loadAsync(url);
  const blob = await fetch(url).then((r) => r.blob());
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const tex = new Texture(bitmap);
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

const sanitize = (n: string) =>
  n
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z]/, 'anim_$&')
    .replace(/^_+/, 'anim_');

const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export interface SceneEffects {
  fadeCenter: Vector3;
  bloom: number;
  darken: number;
  /** a camera flash, 0..1 (effects.flash.intensity) */
  flash: number;
}

export class PaintedScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.1, 1000);
  timeline: Timeline | null = null;
  manifest: SceneManifest | null = null;
  poster: Texture | null = null;
  posterAspect = 1;
  mode: 'none' | 'poster' | '3d' = 'none';
  effects: SceneEffects = { fadeCenter: new Vector3(), bloom: 2, darken: 0, flash: 0 };
  private assets: AssetRuntime[] = [];
  private screens: ScreenRuntime[] = [];
  private cameraNode: Object3D | null = null;
  private pan = 0;
  private tilt = 0;
  private loading3d: Promise<void> | null = null;
  private loadingPoster: Promise<void> | null = null;
  private tmpV = new Vector3();
  private tmpQ = new Quaternion();
  private tmpE = new Euler();
  /** called when the 3D is in place (to let the stage know the first scene is ready) */
  onReady: (() => void) | null = null;

  constructor(
    readonly id: string,
    readonly base: string,
  ) {}

  async manifestLoaded() {
    if (!this.manifest) {
      const [m, t] = await Promise.all([
        fetch(`${this.base}/scene.json`).then((r) => r.json() as Promise<SceneManifest>),
        fetch(`${this.base}/timeline.json`).then((r) => r.json() as Promise<TimelineData>),
      ]);
      this.manifest = m;
      this.timeline = new Timeline(t);
    }
    return this.manifest;
  }

  /** the still; `upload` puts it on the GPU (in a task of its own) before the scene shows it */
  loadPoster(mobile: boolean, upload?: (tex: Texture) => Promise<void>) {
    this.loadingPoster ??= (async () => {
      const m = await this.manifestLoaded();
      const p = mobile ? m.posters.mobile : m.posters.desktop;
      // decoded off the main thread (an <img> would be decoded during the upload, blocking a frame)
      const tex = await loadBitmapTexture(`${this.base}/${p.url}`);
      tex.colorSpace = SRGBColorSpace;
      await upload?.(tex);
      this.poster = tex;
      this.posterAspect = p.width / p.height;
      if (this.mode === 'none') this.mode = 'poster';
    })();
    return this.loadingPoster;
  }

  load3d(renderer: WebGLRenderer, shared: Shared, target: WebGLRenderTarget | null = null) {
    this.loading3d ??= (async () => {
      const m = await this.manifestLoaded();
      if (!m.assets.length) return; // a still painting only
      const loader = gltfLoader(renderer);
      const ktx = ktx2Loader(renderer);
      const parts = await Promise.all(
        m.assets.map(async (a) => {
          const url = `${this.base}/${a.url}`;
          if (a.kind === 'plane') {
            const tex = await ktx.loadAsync(url);
            tex.colorSpace = SRGBColorSpace;
            const mat = painted(tex, shared.mud);
            const mesh = new Mesh(new PlaneGeometry(2, 2), mat);
            return { key: a.key, root: mesh as Object3D, materials: [mat], mixer: null, actions: new Map(), bornAt: 0 } satisfies AssetRuntime;
          }
          const gltf = await loader.loadAsync(url);
          const materials = new Map<unknown, SceneMaterial>();
          gltf.scene.traverse((o) => {
            const mesh = o as Mesh;
            if (!mesh.isMesh) return;
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const out = list.map((src) => {
              let mm = materials.get(src);
              if (!mm) {
                mm = convert(src, shared.mud, shared.env);
                materials.set(src, mm);
              }
              return mm;
            });
            mesh.material = Array.isArray(mesh.material) ? out : out[0];
            mesh.frustumCulled = false; // skinned meshes: bounds are the bind pose, culling would pop parts out
          });
          let mixer: AnimationMixer | null = null;
          const actions = new Map<string, { action: AnimationAction; duration: number }>();
          if (gltf.animations.length) {
            mixer = new AnimationMixer(gltf.scene);
            for (const clip of gltf.animations) {
              const action = mixer.clipAction(clip);
              action.timeScale = 0;
              action.play();
              actions.set(sanitize(clip.name), { action, duration: clip.duration });
            }
          }
          if (m.camera) {
            const node = gltf.scene.getObjectByName(m.camera);
            if (node) this.cameraNode = node;
          }
          const mats = [...materials.values()];
          for (const sc of m.screens ?? []) {
            const node = gltf.scene.getObjectByName(sc.node);
            const load = screenModules[sc.id];
            if (!node || !load) continue;
            const screen = (await load()).createScreen(this.base);
            await screen.ready;
            const tex = new CanvasTexture(screen.canvas);
            tex.colorSpace = SRGBColorSpace;
            tex.anisotropy = 4;
            // the quad over the painted screen (corners: top left, top right, bottom left, bottom right), lifted a
            // little off it along its normal so it never fights with the painted surface
            const [tl, tr, bl, br] = sc.corners.map((c) => new Vector3(...c));
            const n = new Vector3().subVectors(bl, tl).cross(new Vector3().subVectors(tr, tl)).normalize().multiplyScalar(sc.push ?? 0.004);
            const pts = [tl, tr, bl, br].map((v) => v.clone().add(n));
            const geo = new BufferGeometry();
            geo.setAttribute('position', new BufferAttribute(new Float32Array(pts.flatMap((v) => [v.x, v.y, v.z])), 3));
            geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), 2));
            geo.setIndex([0, 2, 1, 1, 2, 3]);
            const mat = painted(tex, shared.mud);
            mat.transparent = false;
            mat.alphaTest = 0;
            const quad = new Mesh(geo, mat);
            quad.frustumCulled = false;
            node.add(quad);
            mats.push(mat);
            screen.draw(0);
            tex.needsUpdate = true;
            this.screens.push({ tex, draw: screen.draw, from: sc.from, to: sc.to, last: 0 });
          }
          return { key: a.key, root: gltf.scene as Object3D, materials: mats, mixer, actions, bornAt: 0 } satisfies AssetRuntime;
        }),
      );
      for (const p of parts) {
        p.root.visible = true;
        this.scene.add(p.root);
      }
      this.assets = parts;
      // compile before the first frame that shows it, so the switch does not stall. Programs depend on where they
      // draw (a linear render target here, not the sRGB screen): compile them for that target
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      const compiling = renderer.compileAsync(this.scene, this.camera);
      renderer.setRenderTarget(prev);
      await compiling;
      const now = performance.now();
      for (const p of parts) p.bornAt = now;
      this.mode = '3d';
      this.onReady?.();
    })();
    return this.loading3d;
  }

  /** false for scenes that are a still painting only */
  get has3d() {
    return !this.manifest || this.manifest.assets.length > 0;
  }

  get is3dLoading() {
    return !!this.loading3d && this.mode !== '3d';
  }

  /**
   * Applies the timeline at a position (viewport heights scrolled into the section) and the pointer.
   * aspect: drawing aspect; pointer in -1..1 (x right, y up).
   */
  update(pos: number, time: number, dt: number, aspect: number, pointer: { x: number; y: number }, mobile: boolean) {
    const tl = this.timeline;
    if (!tl) return;
    // effects
    const fx = tl.values('effects', {
      sectionTransition: { fadeCenter: { x: 0, y: 0, z: 0 } },
      darken: { intensity: 0 },
      flash: { intensity: 0 },
      bloom: { intensity: 8 },
    } as Record<string, any>, pos) as any;
    const fc = fx.sectionTransition.fadeCenter;
    this.effects.fadeCenter.set(fc.x, fc.y, fc.z);
    this.effects.darken = fx.darken?.intensity ?? 0;
    this.effects.flash = fx.flash?.intensity ?? 0;
    this.effects.bloom = fx.bloom?.intensity ?? 8;

    if (this.mode !== '3d') return;
    const now = performance.now();
    for (const sc of this.screens) {
      const p = Math.max(0, Math.min(1, (pos - sc.from) / (sc.to - sc.from)));
      if (Math.abs(p - sc.last) > 0.0015 || (p !== sc.last && (p === 0 || p === 1))) {
        sc.last = p;
        sc.draw(p);
        sc.tex.needsUpdate = true;
      }
    }
    for (const a of this.assets) {
      const v = tl.values(a.key, {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        visibility: 1,
        responsive: 'none',
        metalness: 0,
        roughness: 1,
        animations: {},
      } as Record<string, any>, pos) as any;
      let q = 1;
      if (v.responsive === 'cover') q = Math.max(1, aspect);
      else if (v.responsive === 'contain') q = Math.min(1, aspect);
      a.root.position.set(v.position.x * q, v.position.y * q, v.position.z);
      a.root.rotation.set(v.rotation.x, v.rotation.y, v.rotation.z);
      a.root.scale.set(v.scale.x * q, v.scale.y * q, v.scale.z);
      const loadVis = easeInOutQuad(Math.min(1, (now - a.bornAt) / 400));
      const vis = Math.max(0, Math.min(1, v.visibility));
      a.root.visible = vis > 0.001 && loadVis > 0;
      for (const m of a.materials) {
        m.dissolve.visibility = vis;
        m.dissolve.loadingVisibility = loadVis;
        m.dissolve.time = time;
        const std = m as unknown as { isMeshStandardMaterial?: boolean; metalness: number; roughness: number };
        if (std.isMeshStandardMaterial) {
          std.metalness = v.metalness;
          std.roughness = v.roughness;
        }
      }
      if (a.mixer) {
        for (const [name, { action, duration }] of a.actions) {
          const s = v.animations?.[name];
          if (!s) continue;
          if (s.loop) {
            if (action.timeScale !== 1) {
              action.timeScale = 1;
              action.setLoop(LoopRepeat, Infinity);
            }
          } else {
            action.timeScale = 0;
            action.time = Math.max(0, Math.min(1, s.progress ?? 0)) * duration;
          }
        }
        a.mixer.update(dt);
      }
    }

    // camera
    const c = tl.values('camera', {
      position: { x: 0, y: 0, z: 4 },
      target: { x: 0, y: 0, z: 1 },
      rotation: { x: 0, y: 0, z: 0 },
      fov: 30,
      gaze: 0.5,
    } as Record<string, any>, pos) as any;
    const cam = this.camera;
    if (cam.fov !== c.fov || cam.aspect !== aspect) {
      cam.fov = c.fov;
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    // the reader's pointer turns the camera a little around its target (touch devices: still)
    const gaze = mobile ? 0 : c.gaze;
    const panGoal = -0.1 * gaze + (pointer.x * 0.5 + 0.5) * 0.2 * gaze;
    const tiltGoal = -0.1 * gaze + (pointer.y * 0.5 + 0.5) * 0.2 * gaze;
    const k = 1 - Math.pow(0.9, dt * 60);
    this.pan += (panGoal - this.pan) * k;
    this.tilt += (tiltGoal - this.tilt) * k;
    if (this.cameraNode) {
      this.cameraNode.updateWorldMatrix(true, false);
      this.cameraNode.getWorldPosition(cam.position);
      this.cameraNode.getWorldQuaternion(cam.quaternion);
      this.tmpV.set(this.pan, this.tilt, 0).applyQuaternion(cam.quaternion);
      cam.position.add(this.tmpV);
      this.tmpE.set(-this.tilt + c.rotation.x, this.pan + c.rotation.y, c.rotation.z);
      cam.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE));
    } else {
      const target = this.tmpV.set(c.target.x, c.target.y, c.target.z);
      const dir = new Vector3(c.position.x, c.position.y, c.position.z).sub(target);
      const dist = dir.length();
      dir.normalize();
      const re = this.pan;
      const ce = this.tilt;
      const hx = dir.x * Math.cos(-re) - dir.z * Math.sin(-re);
      const hz = dir.x * Math.sin(re) + dir.z * Math.cos(re);
      const K = Math.cos(-ce);
      const De = Math.sin(-ce);
      dir.set(hx * K, dir.y * K - De, hz * K).normalize();
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      if (c.rotation.x || c.rotation.y || c.rotation.z) {
        cam.rotateX(c.rotation.x);
        cam.rotateY(c.rotation.y);
        cam.rotateZ(c.rotation.z);
      }
    }
    cam.updateMatrixWorld();
  }

  /** Replace the picture of a plane asset (e.g. the billboard), keeping its burn-in. Returns false until it exists. */
  setPlaneMap(key: string, map: Texture) {
    const a = this.assets.find((x) => x.key === key);
    if (!a) return false;
    for (const m of a.materials) {
      m.map = map;
      m.needsUpdate = true;
    }
    return true;
  }

  /** world bounds of the loaded models (debug) */
  bounds() {
    return new Box3().setFromObject(this.scene);
  }

  dispose() {
    this.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v && (v as Texture).isTexture) (v as Texture).dispose();
        m.dispose();
      }
    });
    this.scene.clear();
    this.poster?.dispose();
    this.assets = [];
    this.mode = 'none';
    this.loading3d = null;
    this.loadingPoster = null;
  }
}
