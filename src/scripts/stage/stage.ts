// The stage: one full-screen canvas behind the page that paints the story. Each section of the page has a painted
// scene; while you read a chapter its scene plays (the camera and the figures follow the scroll), and when the next
// chapter's opener comes up the screen, the painting burns away along a glowing edge into the next one. The cream
// paper of the chapters' content is painted here too, with torn edges, so it can wipe over the scene.
//
//   scene A ─┐                          ┌─ bloom (the glowing edges)
//            ├─ composite (transition, ─┤
//   scene B ─┘   darken, paper)         └─ output (sRGB, grain) → screen
//
// Devices that should not run the 3D see each scene's still painting ("poster") through the same transitions.
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { PaintedScene, loadBitmapTexture } from './painted-scene';
import { Sections } from './sections';
import {
  bloomDownFrag,
  bloomPrefilterFrag,
  bloomUpFrag,
  compositeFrag,
  fullscreenVert,
  outputFrag,
} from './shaders';
import { ktx2Loader } from './loaders';

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** 3D scenes (true) or the still paintings only (false) */
  use3d: boolean;
  mobile: boolean;
  /** device pixel ratio cap */
  maxDpr: number;
  scrollY: () => number;
  /** never draw the paper (the stills are rendered without it) */
  noPaper?: boolean;
}

interface PaperBlock {
  el: HTMLElement;
  top: number;
  bottom: number;
}

const POSTER_FRAG = /* glsl */ `
  uniform sampler2D tPoster;
  uniform vec2 uScale;
  uniform vec2 uOffset;
  uniform float uVisible;
  varying vec2 vUv;
  void main() {
    vec2 uv = (vUv - 0.5) * uScale + 0.5 + uOffset;
    vec3 c = texture2D(tPoster, uv).rgb;
    gl_FragColor = vec4(c * uVisible, 1.0);
  }
`;

/** the paper colour from the design tokens (--paper), in linear light for the shaders */
function paperColour() {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#ebe8df';
  const c = new Color(css);
  c.convertSRGBToLinear();
  return new Vector3(c.r, c.g, c.b);
}

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly sections: Sections;
  readonly scenes: (PaintedScene | null)[];
  private opts: StageOptions;
  private rtA: WebGLRenderTarget;
  private rtB: WebGLRenderTarget;
  private rtComp: WebGLRenderTarget;
  private bloomRts: WebGLRenderTarget[] = [];
  private quadScene = new Scene();
  private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private composite: ShaderMaterial;
  private prefilter: ShaderMaterial;
  private down: ShaderMaterial;
  private up: ShaderMaterial;
  private output: ShaderMaterial;
  private posterMat: ShaderMaterial;
  private shared: { mud: Texture; env: Texture | null; noise: Texture };
  private papers: PaperBlock[] = [];
  private pointer = new Vector2(0, 0);
  private pointerSmooth = new Vector2(0.5, 0.5);
  private size = new Vector2(1, 1);
  private cssW = 1;
  private cssH = 1;
  private time = 0;
  private lastStatic = '';
  private introOffset = 0;
  private introStart = -1;
  private introPoster = 0;
  /** set when the hero (first scene) is drawn for the first time */
  onFirstScene: (() => void) | null = null;
  /** set when the hero's 3D is in place (to start its intro) */
  onHeroReady: (() => void) | null = null;
  /** the chapter the reader is in (the next one once its transition is half done) */
  activeIndex = 0;
  /** the paper's position: -1 below the screen, 0 covering, 1 gone above */
  overlay = -1;
  private firstSceneShown = false;
  private disposed = false;
  /** the full-screen passes are compiled */
  private compiled = false;
  /** with 3D on, the hero's still is not shown while its models load, unless they take too long */
  private posterAllowed = false;
  private startedAt = performance.now();

  constructor(opts: StageOptions) {
    this.opts = opts;
    const renderer = new WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.debug.checkShaderErrors = import.meta.env.DEV;
    renderer.toneMapping = NoToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(new Color(0x000000), 1);
    renderer.autoClear = true;
    this.renderer = renderer;

    this.sections = new Sections();
    this.scenes = this.sections.list.map((s) => {
      const id = s.el.dataset.scene;
      return id ? new PaintedScene(id, `/scenes/${id}`) : null;
    });
    const hero = this.scenes[0];
    if (hero) hero.onReady = () => this.onHeroReady?.();
    this.posterAllowed = !opts.use3d;

    const rt = (depth: boolean) =>
      new WebGLRenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, depthBuffer: depth, stencilBuffer: false, generateMipmaps: false, minFilter: LinearFilter, magFilter: LinearFilter });
    this.rtA = rt(true);
    this.rtB = rt(true);
    this.rtComp = rt(false);
    for (let i = 0; i < 5; i++) this.bloomRts.push(rt(false), rt(false));

    // the two small shared maps: placeholders now, their pictures decoded off the main thread
    const mud = new Texture();
    const noise = new Texture();
    for (const t of [mud, noise]) t.wrapS = t.wrapT = RepeatWrapping;
    this.shared = { mud, env: null, noise };
    const fill = (tex: Texture, url: string) =>
      loadBitmapTexture(url)
        .then((t) => {
          tex.image = t.image;
          tex.flipY = t.flipY;
          tex.needsUpdate = true;
          return this.upload(tex);
        })
        .catch(() => {});
    fill(mud, '/scenes/shared/mud-normal.webp');
    fill(noise, '/scenes/shared/noise.png');

    const mk = (frag: string, uniforms: Record<string, { value: unknown }>) =>
      new ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.composite = mk(compositeFrag, {
      tCurrent: { value: null },
      tNext: { value: null },
      tMudNormal: { value: mud },
      tNoise: { value: noise },
      uProgress: { value: 0 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uMouse: { value: new Vector2(0.5, 0.5) },
      uIsHero: { value: 0 },
      uIsFallback: { value: 0 },
      uSceneCenter: { value: new Vector2(0.5, 0.5) },
      uDarken: { value: 0 },
      uFlash: { value: 0 },
      uOverlay: { value: -1 },
      uOverlayColor: { value: paperColour() },
      uGlow: { value: 1 },
    });
    this.prefilter = mk(bloomPrefilterFrag, { tInput: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: 1 } });
    this.down = mk(bloomDownFrag, { tInput: { value: null }, uTexel: { value: new Vector2() } });
    this.up = mk(bloomUpFrag, { tInput: { value: null }, tBase: { value: null }, uTexel: { value: new Vector2() }, uRadius: { value: 1 } });
    this.output = mk(outputFrag, { tColor: { value: null }, tBloom: { value: null }, uBloom: { value: 1 }, uTime: { value: 0 } });
    this.posterMat = mk(POSTER_FRAG, { tPoster: { value: null }, uScale: { value: new Vector2(1, 1) }, uOffset: { value: new Vector2() }, uVisible: { value: 1 } });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    window.addEventListener(
      'pointermove',
      (e) => {
        this.pointer.set((e.clientX / this.cssW) * 2 - 1, -((e.clientY / this.cssH) * 2 - 1));
      },
      { passive: true },
    );
    this.resize();
    // laying the page out to measure it is the expensive part of starting: wait for an idle moment
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(() => this.measure(), { timeout: 1500 });
    else setTimeout(() => this.measure(), 300);
    // the shaders in a task of their own; frames wait for them (a program used before it is linked blocks the page)
    setTimeout(() => this.precompile().finally(() => (this.compiled = true)), 0);
  }

  /** a texture onto the GPU in a task of its own, one at a time, instead of inside a frame with everything else */
  private uploads: Promise<void> = Promise.resolve();
  upload(tex: Texture) {
    this.uploads = this.uploads.then(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            try {
              if (!this.disposed) this.renderer.initTexture(tex);
            } finally {
              resolve();
            }
          }, 0),
        ),
    );
    return this.uploads;
  }

  /** compile the full-screen passes in parallel with the page (KHR_parallel_shader_compile), not on first use */
  private async precompile() {
    // programs depend on their target (linear render targets vs the sRGB screen): compile each for its own
    const group = (mats: ShaderMaterial[]) => {
      const scene = new Scene();
      for (const m of mats) {
        const mesh = new Mesh(this.quad.geometry, m);
        mesh.frustumCulled = false;
        scene.add(mesh);
      }
      return scene;
    };
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rtComp);
    const a = r.compileAsync(group([this.composite, this.prefilter, this.down, this.up, this.posterMat]), this.quadCam);
    r.setRenderTarget(null);
    const b = r.compileAsync(group([this.output]), this.quadCam);
    r.setRenderTarget(prev);
    try {
      await Promise.all([a, b]);
    } catch {
      /* compiled on first use instead */
    }
  }

  /** the studio light for metal parts (KTX2 PMREM), loaded with the first 3D scene */
  private envLoading: Promise<void> | null = null;
  private loadEnv() {
    this.envLoading ??= ktx2Loader(this.renderer)
      .loadAsync('/scenes/shared/studio.pmrem.ktx2')
      .then((t) => {
        t.mapping = 306; // CubeUVReflectionMapping: the file is a ready-made PMREM atlas
        this.shared.env = t;
      })
      .catch(() => {});
    return this.envLoading;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    const W = Math.max(1, Math.round(w * dpr));
    const H = Math.max(1, Math.round(h * dpr));
    this.size.set(W, H);
    this.rtA.setSize(W, H);
    this.rtB.setSize(W, H);
    this.rtComp.setSize(W, H);
    let bw = Math.max(1, W >> 1);
    let bh = Math.max(1, H >> 1);
    for (let i = 0; i < this.bloomRts.length; i += 2) {
      this.bloomRts[i].setSize(bw, bh);
      this.bloomRts[i + 1].setSize(bw, bh);
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
    }
    if (this.sections.measured) this.measure();
    this.lastStatic = '';
  }

  /** read section and paper positions (on resize and when fonts/images change the layout) */
  measure() {
    this.sections.measure();
    const y = this.opts.scrollY();
    const papers = [...document.querySelectorAll<HTMLElement>('[data-paper]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { el, top: r.top + y, bottom: r.bottom + y };
    });
    // papers that touch (the partners' paper and the contact) are one sheet: no tear between them
    this.papers = [];
    for (const p of papers) {
      const last = this.papers[this.papers.length - 1];
      if (last && p.top - last.bottom < 2) last.bottom = Math.max(last.bottom, p.bottom);
      else this.papers.push({ ...p });
    }
    this.lastStatic = '';
  }

  /** the scenes worth having ready: the current one, the next two, and the previous one */
  private prepare(current: number) {
    for (let i = 0; i < this.scenes.length; i++) {
      const s = this.scenes[i];
      if (!s) continue;
      const near = i >= current - 1 && i <= current + 2;
      if (!near) continue;
      s.loadPoster(this.opts.mobile, (tex) => this.upload(tex)).catch(() => {});
      if (this.opts.use3d && i >= current && i <= current + 1) {
        if (!s.is3dLoading && s.mode !== '3d' && s.has3d) {
          this.loadEnv().then(() => s.load3d(this.renderer, this.shared, this.rtA)).catch((e) => console.error(`[scene ${s.id}]`, e));
        }
      }
    }
  }

  private overlayFor(scrollY: number) {
    // the cached height (window.innerHeight in a frame can force the browser to lay the page out)
    const vh = this.sections.vh;
    const lead = 0.06; // the torn edge runs this far (in screen heights) ahead of the paper's box
    const trail = 0.16; // and trails its end by this much, so the last lines stay on paper (the edge is ragged)
    for (const p of this.papers) {
      const top = p.top - scrollY;
      const bottom = p.bottom - scrollY;
      if (bottom <= -vh * trail || top >= vh * (1 + lead)) continue;
      if (top > 0) return Math.max(-1, Math.min(0, -(top / vh) + lead));
      if (bottom < vh * (1 + trail)) return Math.max(0, Math.min(1, 1 - bottom / vh - trail));
      return 0;
    }
    return -1;
  }

  private renderScene(s: PaintedScene | null, target: WebGLRenderTarget, visible = 1) {
    const r = this.renderer;
    r.setRenderTarget(target);
    if (!s || s.mode === 'none') {
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      return;
    }
    if (s.mode === '3d') {
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      r.render(s.scene, s.camera);
      return;
    }
    if (!this.posterAllowed && s.has3d) {
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      return;
    }
    // poster: cover-fit, slow drift, a little parallax with the pointer
    const aspect = this.size.x / this.size.y;
    const pa = s.posterAspect;
    const zoom = 1.06;
    const sx = aspect > pa ? 1 : aspect / pa;
    const sy = aspect > pa ? pa / aspect : 1;
    const u = this.posterMat.uniforms;
    u.tPoster.value = s.poster;
    (u.uScale.value as Vector2).set(sx / zoom, sy / zoom);
    (u.uOffset.value as Vector2).set(this.pointerSmooth.x * -0.012 + Math.sin(this.time * 0.05) * 0.004, this.pointerSmooth.y * -0.012);
    u.uVisible.value = visible;
    this.quad.material = this.posterMat;
    r.render(this.quadScene, this.quadCam);
  }

  private pass(mat: ShaderMaterial, target: WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  private bloom(intensity: number) {
    const rts = this.bloomRts;
    const levels = rts.length / 2;
    // prefilter into level 0
    this.prefilter.uniforms.tInput.value = this.rtComp.texture;
    (this.prefilter.uniforms.uTexel.value as Vector2).set(1 / this.size.x, 1 / this.size.y);
    this.pass(this.prefilter, rts[0]);
    // down the chain (even slots)
    for (let i = 1; i < levels; i++) {
      const src = rts[(i - 1) * 2];
      this.down.uniforms.tInput.value = src.texture;
      (this.down.uniforms.uTexel.value as Vector2).set(1 / src.width, 1 / src.height);
      this.pass(this.down, rts[i * 2]);
    }
    // up the chain (odd slots hold the accumulated result)
    let acc = rts[(levels - 1) * 2];
    for (let i = levels - 2; i >= 0; i--) {
      this.up.uniforms.tInput.value = acc.texture;
      this.up.uniforms.tBase.value = rts[i * 2].texture;
      (this.up.uniforms.uTexel.value as Vector2).set(1 / acc.width, 1 / acc.height);
      this.up.uniforms.uRadius.value = 1;
      this.pass(this.up, rts[i * 2 + 1]);
      acc = rts[i * 2 + 1];
    }
    this.output.uniforms.tBloom.value = acc.texture;
    this.output.uniforms.uBloom.value = intensity;
  }

  /** start the hero's intro: its timeline plays from one screen before its resting point, over 5 s */
  playIntro() {
    if (this.opts.scrollY() > 100 || (location.hash && location.hash !== '#hero')) return;
    this.introStart = performance.now() + 100;
    this.introOffset = -1;
  }

  frame(timeMs: number, dt: number) {
    if (this.disposed) return;
    this.time = timeMs / 1000;
    const y = this.opts.scrollY();
    const st = this.sections.state(y);
    this.prepare(st.current);
    if (!this.compiled) return;
    // 3D that has not arrived after 7 s (slow network, weak GPU): the stills take over
    if (!this.posterAllowed && timeMs - this.startedAt > 7000 && this.scenes[0]?.mode !== '3d') this.posterAllowed = true;
    this.activeIndex = st.next !== null && st.transition >= 0.5 ? st.next : st.current;
    const cur = this.scenes[st.current];
    const nxt = st.next !== null ? this.scenes[st.next] : null;

    // intro offset for the hero timeline (ease-out cubic over 5 s)
    if (this.introStart > 0) {
      const t = Math.min(1, Math.max(0, (timeMs - this.introStart) / 5000));
      this.introOffset = -1 + (1 - Math.pow(1 - t, 3));
      if (t >= 1) this.introStart = -1;
    }
    this.pointerSmooth.lerp(this.pointer, 1 - Math.pow(0.92, dt * 60));
    const aspect = this.size.x / this.size.y;
    const p = { x: this.pointerSmooth.x, y: this.pointerSmooth.y };
    const curPos = this.sections.position(st.current, st.progress) + (st.current === 0 ? this.introOffset : 0);
    cur?.update(Math.max(0, curPos), this.time, dt, aspect, p, this.opts.mobile);
    const transition = nxt && st.transition > 0 ? st.transition : 0;
    if (nxt && transition > 0) nxt.update(this.sections.position(st.next!, st.nextProgress), this.time, dt, aspect, p, this.opts.mobile);

    // the intro reveal for stills (3D scenes burn in on their own)
    let introProgress = 0;
    if (cur && st.current === 0 && cur.mode === 'poster' && this.posterAllowed) {
      if (!this.introPoster) this.introPoster = timeMs;
      introProgress = Math.min(1.5, ((timeMs - this.introPoster) / 1600) * 1.5);
    }

    // the paper follows its box exactly (the transition happens once it has gone)
    const overlay = this.opts.noPaper ? -1 : this.overlayFor(y);
    this.overlay = overlay;

    // nothing moves when the paper covers the whole screen: keep the last frame
    const covered = overlay === 0 && transition === 0;
    const key = covered ? `covered:${st.current}` : '';
    if (key && key === this.lastStatic) return;
    this.lastStatic = key;

    // scenes
    const pr = this.renderer;
    if (!covered) {
      if (introProgress > 0 && introProgress < 1.5) {
        // black -> poster, with the hero's circular burn
        this.renderScene(null, this.rtA);
        this.renderScene(cur, this.rtB);
      } else {
        this.renderScene(cur, this.rtA);
        if (transition > 0) this.renderScene(nxt, this.rtB);
      }
    }

    // composite
    const u = this.composite.uniforms;
    const heroIntro = introProgress > 0 && introProgress < 1.5;
    u.tCurrent.value = this.rtA.texture;
    u.tNext.value = transition > 0 || heroIntro ? this.rtB.texture : this.rtA.texture;
    u.uProgress.value = heroIntro ? introProgress : transition;
    u.uIsHero.value = heroIntro || (st.current === 0 && transition > 0) ? 1 : 0;
    u.uIsFallback.value = cur?.mode === '3d' ? 0 : 1;
    u.uAspect.value = aspect;
    u.uTime.value = this.time;
    (u.uMouse.value as Vector2).set(1 - (this.pointerSmooth.x * 0.5 + 0.5), 1 - (this.pointerSmooth.y * 0.5 + 0.5));
    u.uDarken.value = cur?.effects.darken ?? 0;
    u.uFlash.value = cur?.mode === '3d' ? cur.effects.flash : 0;
    u.uOverlay.value = overlay;
    if (cur && cur.mode === '3d') {
      const c = cur.effects.fadeCenter.clone().project(cur.camera);
      (u.uSceneCenter.value as Vector2).set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5);
    } else (u.uSceneCenter.value as Vector2).set(0.5, 0.55);
    this.pass(this.composite, this.rtComp);

    // bloom (the scene's own intensity; a little for stills so their burning edges still glow)
    const bloomI = cur?.mode === '3d' ? cur.effects.bloom : 2;
    this.bloom(Math.min(bloomI, 10) * 0.25);
    this.output.uniforms.tColor.value = this.rtComp.texture;
    this.output.uniforms.uTime.value = this.time;
    this.pass(this.output, null);
    void pr;

    if (!this.firstSceneShown && cur && (cur.mode === '3d' || (cur.mode === 'poster' && this.posterAllowed))) {
      this.firstSceneShown = true;
      this.onFirstScene?.();
    }
  }

  dispose() {
    this.disposed = true;
    for (const s of this.scenes) s?.dispose();
    this.renderer.dispose();
  }
}
