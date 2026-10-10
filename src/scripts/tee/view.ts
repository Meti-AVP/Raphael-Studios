// The atelier's shirt on screen: the sewn cloth (physics in a worker), drawn as dyed cotton with the reader's design,
// lit like a studio. Pull it anywhere (a pinch of fabric follows the pointer and the rest of the shirt answers),
// turn it by dragging around it, or let the air move it. It can be made a polo (a collar, a placket, buttons) or a
// sweatshirt (long sleeves, ribbed cuffs): those parts (public/tee/garments.json) ride the cloth, each point of them
// bound to the triangle of the shirt it lies on, or (a long sleeve, carried on from the hem) to a frame of the hem.
import {
  NeutralToneMapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { compileInSteps, nextTask, studioEnvironment, uploadTextures } from '../core/studio-env';
import { loadTee, type TeeData } from './data';
import { PrintAtlas, type Design, type Mark, type Technique } from './print';

export type Garment = 'tee' | 'polo' | 'sweat';
interface PartData {
  pos: number[];
  tri: number[];
}
interface GarmentsData {
  polo: { collar: PartData; placket: PartData; buttons: number[][] };
  sweat: { sleeve: PartData; cuff: PartData; ring: number }[];
}
/** a part riding the cloth: per vertex, three particles, the weights of the first two, its offset in their frame */
interface Part {
  mesh: Mesh<BufferGeometry, MeshPhysicalMaterial>;
  abc: Int32Array;
  w: Float32Array;
  off: Float32Array;
}

const blank = (on: boolean, d: Partial<Mark> = {}): Mark => ({ on, text: 'Raphael Studios', logo: null, font: 'classic', ink: '#0c6e66', technique: 'embroidery', size: 1, lift: 0, ...d });
export const defaultDesign = (): Design => ({
  colour: '#f4f1ea',
  marks: { chest: blank(true), center: blank(false), back: blank(false, { technique: 'print' }), sleeve: blank(false) },
});

export interface TeeViewOptions {
  canvas: HTMLCanvasElement;
  quality: 'hi' | 'lo';
  onReady?: () => void;
}

const CENTER = new Vector3(0, 1.1, 0);

export class TeeView {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 0.1, 20);
  private data!: TeeData;
  private atlas!: PrintAtlas;
  private mesh!: Mesh<BufferGeometry, MeshPhysicalMaterial>;
  private geo!: BufferGeometry;
  private worker: Worker;
  private phys!: Float32Array; // latest positions from the worker
  private spare: Float32Array | null = null;
  private waiting = false;
  private baseTex!: CanvasTexture;
  private printTex!: CanvasTexture;
  private reliefTex!: CanvasTexture;
  private uniforms = { uReveal: { value: 1 }, uRevealMode: { value: 0 }, uTime: { value: 0 } };
  private yaw = 0;
  private yawVel = 0;
  private pitch = 0.04;
  private grab: { ids: number[]; weights: number[]; plane: Plane; point: Vector3; start: Vector3 } | null = null;
  /** what a drag on the shirt does: turn it (the default: seeing all of it), or pull its fabric */
  mode: 'turn' | 'pull' = 'turn';
  private yawGoal: number | null = null;
  private turning: { x: number; yaw: number } | null = null;
  private pointer = new Vector2();
  private ray = new Raycaster();
  private gust = 0;
  private time = 0;
  private design: Design = defaultDesign();
  private garment: Garment = 'tee';
  private garmentData: Promise<GarmentsData> | null = null;
  private parts = new Map<Garment, Part[]>();
  private partMat: MeshPhysicalMaterial | null = null;
  private technique: Technique = 'embroidery';
  private disposed = false;
  private visible = true;
  private nbStart = new Uint32Array(0);
  private nb = new Uint32Array(0);
  private ao = new Float32Array(0);
  /** per triangle: +1 where its winding faces out of the shirt, -1 where the piece was sewn turned in (the back, a sleeve) */
  private triOut = new Int8Array(0);
  hovering = false;
  onHover: ((on: boolean) => void) | null = null;

  constructor(private opts: TeeViewOptions) {
    const r = new WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'hi' ? 2 : 1.5));
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = NeutralToneMapping;
    r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true;
    r.shadowMap.type = PCFShadowMap; // soft through each light's shadow radius (PCFSoft is gone: it would recompile every material)
    r.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer = r;
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<{ type: string; buffer: Float32Array }>) => {
      if (e.data.type !== 'positions') return;
      this.spare = this.phys;
      this.phys = e.data.buffer;
      this.waiting = false;
    };
  }

  async init() {
    const q = this.opts.quality;
    this.data = await loadTee(q);
    const d = this.data;
    // physics
    this.phys = new Float32Array(d.position);
    this.spare = new Float32Array(d.position.length);
    this.worker.postMessage({
      type: 'setup',
      pos: d.position,
      tri: d.triangles,
      stretch: d.stretch,
      stretchRest: d.stretchRest,
      bend: d.bend,
      bendRest: d.bendRest,
      body: d.body,
      substeps: q === 'hi' ? 12 : 9,
      // (stretch a little soft: perfectly stiff jersey fought the body it rests on every substep, and shook)
      params: { damping: 0.6, friction: 0.35, bendCompliance: 1.2e-5, stretchCompliance: 5e-7 },
    });
    // the surface
    this.atlas = new PrintAtlas(d, q === 'hi' ? 2048 : 1024);
    this.atlas.drawBase(this.design.colour);
    this.atlas.drawPrint(this.design);
    const tex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = new CanvasTexture(c);
      if (srgb) t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
      t.minFilter = LinearMipmapLinearFilter;
      return t;
    };
    this.baseTex = tex(this.atlas.base, true);
    this.printTex = tex(this.atlas.print, true);
    this.reliefTex = tex(this.atlas.relief, false);
    await nextTask();
    // the render mesh: one vertex per piece corner (seams split for the UVs), positions copied from the physics
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(d.renderCount * 3), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(d.renderCount * 3), 3));
    geo.setAttribute('uv', new BufferAttribute(d.renderUv, 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(d.renderCount * 3).fill(1), 3));
    // which way each piece faces: some were sewn with their faces turned in (the back, one sleeve), so their outside is
    // the GL back face; the shader prints on the outside, and the folds' occlusion reads the outward normal
    const pieces = Object.keys(d.pieces).length;
    const vote = new Float64Array(pieces);
    const rp = (i: number) => d.renderMap[i] * 3;
    const rt = d.renderTriangles;
    const triPiece = new Uint8Array(rt.length / 3);
    for (let t = 0; t < rt.length; t += 3) {
      const a = rp(rt[t]), b = rp(rt[t + 1]), c = rp(rt[t + 2]);
      const P = d.position;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
      const piece = d.renderPiece[rt[t]];
      triPiece[t / 3] = piece;
      // out from the shirt's upright axis
      vote[piece] += Math.sign(nx * (P[a] + P[b] + P[c]) + nz * (P[a + 2] + P[b + 2] + P[c + 2]));
    }
    const facing = Array.from(vote, (v) => (v >= 0 ? 1 : -1));
    geo.setAttribute('aOut', new BufferAttribute(Float32Array.from(d.renderPiece, (pc) => facing[pc]), 1));
    this.triOut = Int8Array.from(triPiece, (pc) => facing[pc]);
    // neighbours of each particle (from the stretch edges), for the folds' occlusion
    const deg = new Uint32Array(d.physCount + 1);
    for (let k = 0; k < d.stretch.length; k++) deg[d.stretch[k] + 1]++;
    for (let i = 0; i < d.physCount; i++) deg[i + 1] += deg[i];
    const fill = deg.slice(0, d.physCount);
    const nb = new Uint32Array(d.stretch.length);
    for (let k = 0; k < d.stretch.length; k += 2) {
      const a = d.stretch[k];
      const b = d.stretch[k + 1];
      nb[fill[a]++] = b;
      nb[fill[b]++] = a;
    }
    this.nbStart = deg;
    this.nb = nb;
    this.ao = new Float32Array(d.physCount).fill(1);
    geo.setIndex(new BufferAttribute(d.renderTriangles, 1));
    this.geo = geo;
    const mat = new MeshPhysicalMaterial({
      map: this.baseTex,
      bumpMap: this.reliefTex,
      bumpScale: 1.2,
      roughness: 0.94,
      metalness: 0,
      sheen: 0.55,
      sheenRoughness: 0.55,
      sheenColor: new Color(this.design.colour).lerp(new Color('#ffffff'), 0.35),
      side: DoubleSide,
      vertexColors: true,
      envMapIntensity: 0.42,
    });
    mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, this.uniforms, { printMap: { value: this.printTex } });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aOut;
          varying float vOut;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vOut = aOut;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D printMap;
          uniform float uReveal;
          uniform float uRevealMode;
          uniform float uTime;
          varying float vOut;
          float teeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec4 pr = texture2D(printMap, vMapUv);
            // the press: a squeegee pass top to bottom (print) or thread by thread (embroidery)
            float edge = uRevealMode < 0.5 ? (1.0 - vMapUv.y) : teeHash(floor(vMapUv * 900.0));
            float shown = smoothstep(edge - 0.015, edge, uReveal * 1.03);
            // (the outside: the front face of a piece sewn facing out, the back face of one sewn turned in)
            if ((vOut > 0.0) == gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, pr.rgb, pr.a * shown);
            else diffuseColor.rgb *= 0.55; // the inside of the shirt, in its own shadow
          }`,
        );
    };
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    this.scene.add(mesh);
    // the studio: soft room light, a key from the upper left, a soft shadow on the floor below
    // the room's light, ready-made (building it here would stall the page)
    this.scene.environment = await studioEnvironment();
    const key = new DirectionalLight('#fff6ea', 2.7);
    key.position.set(-2.1, 2.0, 1.5);
    key.target.position.copy(CENTER);
    key.castShadow = true;
    key.shadow.mapSize.set(q === 'hi' ? 2048 : 1024, q === 'hi' ? 2048 : 1024);
    key.shadow.camera.left = -0.6;
    key.shadow.camera.right = 0.6;
    key.shadow.camera.top = 0.6;
    key.shadow.camera.bottom = -0.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 5;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);
    this.scene.add(new HemisphereLight('#fffaf2', '#bdb6a6', 0.3));
    // a rim from behind, so the silhouette and the folds' edges catch light
    const rim = new DirectionalLight('#ffffff', 0.9);
    rim.position.set(1.6, 1.8, -1.8);
    rim.target.position.copy(CENTER);
    this.scene.add(rim, rim.target);
    const floor = new Mesh(new PlaneGeometry(4, 4), new ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.6;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.copyPositions();
    this.resize();
    this.bind();
    // the shaders compile alongside the page, the pictures go up one per task, then the first frame
    await nextTask();
    await compileInSteps(this.renderer, this.scene, this.camera);
    await uploadTextures(this.renderer, this.scene, [this.scene.environment]);
    this.opts.onReady?.();
  }

  /** physics -> render vertices, then normals */
  private copyPositions() {
    const d = this.data;
    const pos = this.geo.attributes.position.array as Float32Array;
    const map = d.renderMap;
    const p = this.phys;
    for (let i = 0; i < d.renderCount; i++) {
      const j = map[i] * 3;
      pos[i * 3] = p[j];
      pos[i * 3 + 1] = p[j + 1];
      pos[i * 3 + 2] = p[j + 2];
    }
    this.geo.attributes.position.needsUpdate = true;
    // smooth normals across the seams: accumulate per physics vertex, then share
    const n = new Float32Array(d.physCount * 3);
    // (and turned outward everywhere, for the folds: a piece sewn turned in has its winding's normals inward)
    const no = new Float32Array(d.physCount * 3);
    const tri = d.triangles;
    for (let t = 0; t < tri.length; t += 3) {
      const a = tri[t] * 3;
      const b = tri[t + 1] * 3;
      const c = tri[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
      n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
      n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
      const sg = this.triOut[t / 3] || 1;
      no[a] += nx * sg; no[a + 1] += ny * sg; no[a + 2] += nz * sg;
      no[b] += nx * sg; no[b + 1] += ny * sg; no[b + 2] += nz * sg;
      no[c] += nx * sg; no[c + 1] += ny * sg; no[c + 2] += nz * sg;
    }
    const nr = this.geo.attributes.normal.array as Float32Array;
    for (let i = 0; i < d.renderCount; i++) {
      const j = map[i] * 3;
      const l = Math.hypot(n[j], n[j + 1], n[j + 2]) || 1;
      nr[i * 3] = n[j] / l;
      nr[i * 3 + 1] = n[j + 1] / l;
      nr[i * 3 + 2] = n[j + 2] / l;
    }
    this.geo.attributes.normal.needsUpdate = true;
    // the folds' occlusion: a particle whose neighbours stand in front of it (along its normal) sits in a valley
    const { nbStart, nb, ao } = this;
    for (let v = 0; v < d.physCount; v++) {
      const s0 = nbStart[v];
      const s1 = nbStart[v + 1];
      if (s1 === s0) continue;
      let lx = 0, ly = 0, lz = 0;
      for (let k = s0; k < s1; k++) {
        const q = nb[k] * 3;
        lx += p[q];
        ly += p[q + 1];
        lz += p[q + 2];
      }
      const inv = 1 / (s1 - s0);
      const v3 = v * 3;
      lx = lx * inv - p[v3];
      ly = ly * inv - p[v3 + 1];
      lz = lz * inv - p[v3 + 2];
      const ln = Math.hypot(no[v3], no[v3 + 1], no[v3 + 2]) || 1;
      const curv = (lx * no[v3] + ly * no[v3 + 1] + lz * no[v3 + 2]) / ln; // metres
      const target = 1 - Math.max(0, Math.min(0.42, curv * 70));
      ao[v] += (target - ao[v]) * 0.5;
    }
    const col = this.geo.attributes.color.array as Float32Array;
    for (let i = 0; i < d.renderCount; i++) {
      const a = ao[map[i]];
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a;
    }
    this.geo.attributes.color.needsUpdate = true;
  }

  resize() {
    const c = this.opts.canvas;
    const w = c.clientWidth || 1;
    const h = c.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // fit the shirt (about 0.9 m tall, 0.95 m wide with the sleeves) with air around it
    const fitH = 1.22 / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const fitW = 1.4 / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect);
    this.dist = Math.max(fitH, fitW);
    this.camera.updateProjectionMatrix();
  }
  private dist = 2.4;

  private toLocal(v: Vector3) {
    // the shirt turns (yaw) about the y axis through the centre; the physics lives in the shirt's frame
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    return new Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  }

  private bind() {
    const c = this.opts.canvas;
    const set = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    c.addEventListener('pointerdown', (e) => {
      set(e);
      this.ray.setFromCamera(this.pointer, this.camera);
      const hit = this.mode === 'pull' ? this.ray.intersectObject(this.mesh, false)[0] : undefined;
      c.setPointerCapture(e.pointerId);
      this.yawGoal = null;
      if (hit && hit.face) {
        // the nearest particle to the touch, and its neighbours within 4 cm (weighted)
        const local = this.toLocal(hit.point);
        const p = this.phys;
        const ids: number[] = [];
        const weights: number[] = [];
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < this.data.physCount; i++) {
          const d = Math.hypot(p[i * 3] - local.x, p[i * 3 + 1] - local.y, p[i * 3 + 2] - local.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
          if (d < 0.04) {
            ids.push(i);
            weights.push(1 - d / 0.04);
          }
        }
        if (best >= 0) {
          ids.unshift(best);
          weights.unshift(1);
          const normal = new Vector3();
          this.camera.getWorldDirection(normal);
          this.grab = { ids, weights, plane: new Plane().setFromNormalAndCoplanarPoint(normal, hit.point), point: hit.point.clone(), start: hit.point.clone() };
          this.gust = 0;
        }
      } else {
        this.turning = { x: e.clientX, yaw: this.yaw };
      }
    });
    c.addEventListener('pointermove', (e) => {
      set(e);
      if (this.grab) {
        this.ray.setFromCamera(this.pointer, this.camera);
        const p = new Vector3();
        if (this.ray.ray.intersectPlane(this.grab.plane, p)) {
          // a hand pulls cloth so far and no further: the pinch stays within 16 cm of where it was taken
          const off = p.sub(this.grab.start);
          if (off.length() > 0.16) off.setLength(0.16);
          this.grab.point.copy(this.grab.start).add(off);
        }
      } else if (this.turning) {
        const yaw = this.turning.yaw + ((e.clientX - this.turning.x) / c.clientWidth) * Math.PI * 1.6;
        this.yawVel = yaw - this.yaw;
        this.yaw = yaw;
      } else if (e.pointerType === 'mouse' && this.mode === 'pull') {
        this.ray.setFromCamera(this.pointer, this.camera);
        const on = this.ray.intersectObject(this.mesh, false).length > 0;
        if (on !== this.hovering) {
          this.hovering = on;
          this.onHover?.(on);
        }
      }
    });
    const end = () => {
      this.grab = null;
      this.turning = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (this.hovering) {
        this.hovering = false;
        this.onHover?.(false);
      }
    });
    // (the latest entry: a batch can hold an older one first, as when the studio opens just as it starts)
    new IntersectionObserver((es) => (this.visible = es[es.length - 1].isIntersecting), { rootMargin: '10%' }).observe(c);
  }

  /** a puff of air from the front (the "blow" button, or a quick tap) */
  blow() {
    this.gust = 2.6;
  }

  /** turns the shirt to show a side: 0 the front, PI the back (the nearest way round) */
  turnTo(angle: number) {
    const full = Math.PI * 2;
    let a = angle;
    while (a - this.yaw > Math.PI) a -= full;
    while (a - this.yaw < -Math.PI) a += full;
    this.yawGoal = a;
    this.yawVel = 0;
  }

  setMode(m: 'turn' | 'pull') {
    this.mode = m;
    this.grab = null;
    if (m === 'turn' && this.hovering) {
      this.hovering = false;
      this.onHover?.(false);
    }
  }

  /** the design changes; animate plays the making of it (with the technique of the mark just changed) */
  setDesign(d: Partial<Design>, animate = false, technique: Technique = this.technique) {
    const colourChanged = d.colour && d.colour !== this.design.colour;
    this.design = { ...this.design, ...d };
    if (colourChanged) {
      this.atlas.drawBase(this.design.colour);
      this.baseTex.needsUpdate = true;
      this.mesh.material.sheenColor.set(this.design.colour).lerp(new Color('#ffffff'), 0.35);
      this.tintParts();
    }
    this.atlas.drawPrint(this.design);
    this.printTex.needsUpdate = true;
    this.reliefTex.needsUpdate = true;
    this.technique = technique;
    if (animate) this.make(technique);
  }

  /** play the production: the squeegee pass, or the stitches going in */
  make(technique: Technique = this.technique) {
    this.uniforms.uRevealMode.value = technique === 'embroidery' ? 1 : 0;
    this.uniforms.uReveal.value = 0;
    this.revealStart = performance.now();
    this.revealLength = technique === 'embroidery' ? 2600 : 1400;
  }
  private revealLength = 2600;

  // ---- the garment: a T-shirt, a polo, a sweatshirt

  get kind() {
    return this.garment;
  }

  async setGarment(kind: Garment) {
    this.garment = kind;
    if (kind !== 'tee' && !this.parts.has(kind)) {
      this.garmentData ??= fetch('/tee/garments.json').then((r) => r.json() as Promise<GarmentsData>);
      const data = await this.garmentData;
      if (!this.parts.has(kind)) this.parts.set(kind, this.buildParts(kind, data));
    }
    if (this.garment !== kind) return; // (another was chosen meanwhile)
    for (const [k, list] of this.parts) for (const part of list) part.mesh.visible = k === kind;
    this.updateParts();
  }

  private tintParts() {
    if (!this.partMat) return;
    // the rib knit of a collar or a cuff: the fabric's colour, a shade deeper
    this.partMat.color.set(this.design.colour).multiplyScalar(0.9);
    this.partMat.sheenColor.set(this.design.colour).lerp(new Color('#ffffff'), 0.35);
  }

  private buildParts(kind: Garment, data: GarmentsData): Part[] {
    this.partMat ??= new MeshPhysicalMaterial({ roughness: 0.95, metalness: 0, sheen: 0.5, sheenRoughness: 0.6, side: DoubleSide, envMapIntensity: 0.42 });
    this.tintParts();
    const out: Part[] = [];
    const rest = this.data.position;
    const tris = this.data.triangles;
    const P = (i: number) => new Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
    const corners: Vector3[] = [];
    for (let t = 0; t < tris.length; t++) corners.push(P(tris[t]));
    const nearestParticle = (x: number, y: number, z: number) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < this.data.physCount; i++) {
        const d = (rest[i * 3] - x) ** 2 + (rest[i * 3 + 1] - y) ** 2 + (rest[i * 3 + 2] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    };
    // pos: the part's points; frame: three particles the points from index `free` on are carried by (else each point
    // rides the triangle of the shirt nearest it)
    const make = (pos: number[], tri: number[], mat: MeshPhysicalMaterial, frame: [number, number, number] | null = null, free = 0) => {
      const n = pos.length / 3;
      const abc = new Int32Array(n * 3);
      const w = new Float32Array(n * 2);
      const off = new Float32Array(n * 3);
      const q = new Vector3();
      for (let v = 0; v < n; v++) {
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        let a = 0, b = 0, c = 0, w0 = 1 / 3, w1 = 1 / 3;
        if (frame && v >= free) [a, b, c] = frame;
        else {
          let bd = Infinity;
          const pt = new Vector3(x, y, z);
          for (let t = 0; t < tris.length; t += 3) {
            const A = corners[t], B = corners[t + 1], C = corners[t + 2];
            // a quick reject: the point is far from the triangle's first corner
            if (A.distanceToSquared(pt) > 0.04) continue;
            const r = closestOnTriangle(pt, A, B, C, q);
            const d = q.distanceToSquared(pt);
            if (d < bd) {
              bd = d;
              [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
              [w0, w1] = r;
            }
          }
        }
        abc.set([a, b, c], v * 3);
        w.set([w0, w1], v * 2);
        const A = P(a), B = P(b), C = P(c);
        const o = A.clone().multiplyScalar(w0).addScaledVector(B, w1).addScaledVector(C, 1 - w0 - w1);
        const [e1, e2, nn] = frameOf(A, B, C);
        const d = new Vector3(x, y, z).sub(o);
        off.set([d.dot(e1), d.dot(e2), d.dot(nn)], v * 3);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      geo.setIndex(tri);
      geo.computeVertexNormals();
      const mesh = new Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.mesh.add(mesh);
      out.push({ mesh, abc, w, off });
    };
    if (kind === 'polo') {
      make(data.polo.collar.pos, data.polo.collar.tri, this.partMat);
      make(data.polo.placket.pos, data.polo.placket.tri, this.partMat);
      // the buttons: small pearl discs facing out
      const pearl = new MeshPhysicalMaterial({ color: '#efece4', roughness: 0.35, clearcoat: 0.6, side: DoubleSide });
      for (const [bx, by, bz] of data.polo.buttons) {
        const pos = [bx, by, bz + 0.001];
        const tri: number[] = [];
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          pos.push(bx + Math.cos(a) * 0.0055, by + Math.sin(a) * 0.0055, bz);
          if (k) tri.push(0, k, k + 1);
        }
        make(pos, tri, pearl);
      }
    } else if (kind === 'sweat') {
      for (const s of data.sweat) {
        // the sleeve's first ring lies on the hem (it rides it point by point); the rest is carried by three of the
        // hem's particles, a third of the way round from each other
        const R = s.ring;
        const at = (k: number) => nearestParticle(s.sleeve.pos[k * 3], s.sleeve.pos[k * 3 + 1], s.sleeve.pos[k * 3 + 2]);
        const frame: [number, number, number] = [at(0), at(Math.round(R / 3)), at(Math.round((2 * R) / 3))];
        make(s.sleeve.pos, s.sleeve.tri, this.partMat, frame, R);
        make(s.cuff.pos, s.cuff.tri, this.partMat, frame, 0);
      }
    }
    return out;
  }

  /** the parts follow the cloth: each point from its particles' places now */
  private updateParts() {
    const list = this.parts.get(this.garment);
    if (!list || this.garment === 'tee') return;
    const p = this.phys;
    const A = new Vector3(), B = new Vector3(), C = new Vector3();
    for (const part of list) {
      const pos = part.mesh.geometry.attributes.position.array as Float32Array;
      const n = pos.length / 3;
      for (let v = 0; v < n; v++) {
        const a = part.abc[v * 3] * 3, b = part.abc[v * 3 + 1] * 3, c = part.abc[v * 3 + 2] * 3;
        A.set(p[a], p[a + 1], p[a + 2]);
        B.set(p[b], p[b + 1], p[b + 2]);
        C.set(p[c], p[c + 1], p[c + 2]);
        const w0 = part.w[v * 2], w1 = part.w[v * 2 + 1];
        const [e1, e2, nn] = frameOf(A, B, C);
        const o1 = part.off[v * 3], o2 = part.off[v * 3 + 1], o3 = part.off[v * 3 + 2];
        pos[v * 3] = A.x * w0 + B.x * w1 + C.x * (1 - w0 - w1) + e1.x * o1 + e2.x * o2 + nn.x * o3;
        pos[v * 3 + 1] = A.y * w0 + B.y * w1 + C.y * (1 - w0 - w1) + e1.y * o1 + e2.y * o2 + nn.y * o3;
        pos[v * 3 + 2] = A.z * w0 + B.z * w1 + C.z * (1 - w0 - w1) + e1.z * o1 + e2.z * o2 + nn.z * o3;
      }
      part.mesh.geometry.attributes.position.needsUpdate = true;
      part.mesh.geometry.computeVertexNormals();
    }
  }

  /** the shirt seen from the front and from the back, still, for the spec sheet (each a canvas of the stage's size) */
  views(): HTMLCanvasElement[] {
    const keep = this.yaw;
    const shots = [0, Math.PI].map((yaw) => {
      this.mesh.rotation.y = yaw;
      this.renderer.render(this.scene, this.camera);
      const c = document.createElement('canvas');
      c.width = this.opts.canvas.width;
      c.height = this.opts.canvas.height;
      c.getContext('2d')!.drawImage(this.opts.canvas, 0, 0);
      return c;
    });
    this.mesh.rotation.y = keep;
    return shots;
  }
  private revealStart = 0;

  get current() {
    return this.design;
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.opts.canvas.toDataURL('image/png');
  }

  frame(dt: number) {
    if (this.disposed || !this.data) return;
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    if (this.revealStart) {
      const t = (performance.now() - this.revealStart) / this.revealLength;
      this.uniforms.uReveal.value = Math.min(1, t);
      if (t >= 1) this.revealStart = 0;
    }
    if (!this.visible) return;
    // turning: inertia after a drag (the shirt stays where the reader leaves it), or an eased turn to a side
    if (!this.turning) {
      if (this.yawGoal !== null) {
        this.yaw += (this.yawGoal - this.yaw) * Math.min(1, dt * 6);
        if (Math.abs(this.yawGoal - this.yaw) < 0.001) this.yawGoal = null;
      } else {
        this.yawVel *= 0.92;
        this.yaw += this.yawVel;
      }
    }
    this.mesh.rotation.y = this.yaw;
    // step the physics (one frame behind: we draw what the worker sent last)
    if (!this.waiting && this.spare) {
      this.waiting = true;
      const breeze = 0.1 + Math.sin(this.time * 0.9) * 0.06 + Math.sin(this.time * 2.3) * 0.02;
      const w = this.toLocal(new Vector3(Math.sin(this.time * 0.4) * 0.08, 0, -(breeze + this.gust)));
      this.gust *= 0.9;
      let grab = null;
      if (this.grab) {
        const l = this.toLocal(this.grab.point);
        grab = { ids: this.grab.ids, weights: this.grab.weights, x: l.x, y: l.y, z: l.z };
      }
      const buf = this.spare;
      this.spare = null;
      this.worker.postMessage({ type: 'step', dt, buffer: buf, grab, wind: [w.x, w.y, w.z] }, [buf.buffer]);
    }
    this.copyPositions();
    this.updateParts();
    // camera: a little above the chest, pulled back to fit
    const cam = this.camera;
    cam.position.set(0, CENTER.y + Math.sin(this.pitch) * this.dist, Math.cos(this.pitch) * this.dist);
    cam.lookAt(CENTER);
    this.renderer.render(this.scene, cam);
  }

  dispose() {
    this.disposed = true;
    this.worker.terminate();
    this.renderer.dispose();
  }
}

/** a triangle's frame: along its first edge, across it, its normal */
function frameOf(A: Vector3, B: Vector3, C: Vector3): [Vector3, Vector3, Vector3] {
  const e1 = B.clone().sub(A);
  const n = e1.clone().cross(C.clone().sub(A)).normalize();
  e1.normalize();
  return [e1, n.clone().cross(e1), n];
}

/** the point of triangle ABC nearest p (into out), and its weights for A and B (Ericson, Real-Time Collision Detection 5.1.5) */
function closestOnTriangle(p: Vector3, a: Vector3, b: Vector3, c: Vector3, out: Vector3): [number, number] {
  const ab = b.clone().sub(a), ac = c.clone().sub(a), ap = p.clone().sub(a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a), [1, 0];
  const bp = p.clone().sub(b);
  const d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b), [0, 1];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out.copy(a).addScaledVector(ab, v);
    return [1 - v, v];
  }
  const cp = p.clone().sub(c);
  const d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c), [0, 0];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out.copy(a).addScaledVector(ac, w);
    return [1 - w, 0];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out.copy(b).addScaledVector(c.clone().sub(b), w);
    return [0, 1 - w];
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  out.copy(a).addScaledVector(ab, v).addScaledVector(ac, w);
  return [1 - v - w, v];
}
