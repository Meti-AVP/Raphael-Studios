// The tumbler at the top of the gifts chapter (components/Tumbler.astro), after the jar on Agrumea's product page:
//   * scroll: while the stage crosses the screen, --ph goes 0 -> 1: the tumbler rises over the title, leans and
//     shrinks a little, the title sinks behind it (CSS), and the printed wrap turns half way round (here);
//   * drag: the tumbler turns under the hand and keeps turning a moment after it (a light friction);
//   * type: the wrap is printed again with the reader's brand.
// three.js draws it only when something changed (the scroll, the hand, the brand), never while it is out of sight.
import { onTick } from '../core/ticker';
import { gpuTier, glFailed, reduceMotion } from '../core/env';
import { studioEnvironment } from '../core/studio-env';
import { fitSize } from '../core/canvas-text';

const TURQ_DEEP = '#0c6e66';
const GOLD = '#d8b062';
const IVORY = '#f3eee2';
const WRAP_W = 2048;
const WRAP_H = 704;

function drawWrap(ctx: CanvasRenderingContext2D, brand: string) {
  const w = WRAP_W;
  const h = WRAP_H;
  ctx.fillStyle = TURQ_DEEP;
  ctx.fillRect(0, 0, w, h);
  // the studio's star lattice, faint, all round
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = IVORY;
  ctx.lineWidth = 2;
  const cell = 88;
  for (let y = cell / 2; y < h; y += cell) {
    for (let x = (Math.round(y / cell) % 2) * (cell / 2); x < w + cell; x += cell) {
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const r = k % 2 ? 12 : 26;
        ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
  // two gold rules near the top and the bottom
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 70, w, 5);
  ctx.fillRect(0, h - 75, w, 5);
  // the brand, twice round (one face each side), and the R between
  const name = (brand.trim() || 'Raphael Studios').toUpperCase();
  const font = (px: number) => `700 ${px}px Philosopher, Georgia, serif`;
  const size = fitSize(ctx, name, font, w * 0.36, 150, 0.06);
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = IVORY;
  for (const cx of [w * 0.25, w * 0.75]) {
    ctx.fillText(name, cx, h * 0.47);
    ctx.font = `400 ${Math.round(size * 0.32)}px Philosopher, Georgia, serif`;
    ctx.fillStyle = GOLD;
    ctx.fillText('MADE TO BE KEPT · CAIRO', cx, h * 0.47 + size * 0.85);
    ctx.font = font(size);
    ctx.fillStyle = IVORY;
  }
  for (const cx of [0, w * 0.5, w]) {
    ctx.beginPath();
    ctx.arc(cx, h * 0.5, 92, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.font = `700 120px Philosopher, Georgia, serif`;
    ctx.fillText('R', cx, h * 0.5 + 6);
  }
}

export default async function tumbler(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('[data-tumbler-stage]');
  const jar = root.querySelector<HTMLElement>('[data-tumbler-jar]');
  const canvas = root.querySelector<HTMLCanvasElement>('.tumbler__canvas');
  const input = root.querySelector<HTMLInputElement>('[data-tumbler-brand]');
  if (!stage || !jar || !canvas || !input) return;

  // --- the scroll: --ph and the turn it gives the wrap
  let ph = -1;
  let visible = false;
  new IntersectionObserver((e) => (visible = e[e.length - 1].isIntersecting), { rootMargin: '20% 0px' }).observe(root);

  // --- 3D (where the device can): a lathe for the steel body, its printed sleeve, a lid
  if (gpuTier() === 0) return scrollOnly();
  let three: typeof import('three');
  try {
    three = await import('three');
  } catch (err) {
    return glFailed('tumbler', err), scrollOnly();
  }
  const { WebGLRenderer, Scene, PerspectiveCamera, LatheGeometry, Vector2, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, DirectionalLight, AmbientLight, Group, RepeatWrapping, NeutralToneMapping } = three;
  let renderer: InstanceType<typeof WebGLRenderer>;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    return glFailed('tumbler', err), scrollOnly();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gpuTier() === 2 ? 2 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  const scene = new Scene();
  const camera = new PerspectiveCamera(18, 0.62, 0.1, 20);
  camera.position.set(0, 0.06, 3.6);
  camera.lookAt(0, -0.02, 0);
  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(-1.4, 1.2, 2.2);
  scene.add(key);
  const rim = new DirectionalLight(0xbfe9e3, 1.4);
  rim.position.set(1.8, 0.4, -1.2);
  scene.add(rim);
  studioEnvironment().then((env) => {
    if (!env) return;
    scene.environment = env;
    draw();
  });

  // the profile: a slightly tapered steel tumbler, rounded at the foot; the sleeve follows its wall; the lid on top
  const r = (y: number) => 0.3 + (y + 0.5) * 0.04;
  const body = [new Vector2(0, -0.5), new Vector2(0.27, -0.5), new Vector2(0.295, -0.493), new Vector2(0.302, -0.475)];
  for (let i = 0; i <= 12; i++) {
    const y = -0.47 + (i / 12) * 0.8;
    body.push(new Vector2(r(y), y));
  }
  body.push(new Vector2(r(0.33) + 0.004, 0.335), new Vector2(r(0.33) - 0.01, 0.34));
  // (bottom to top: the lathe's faces look outwards, and v = 0 at the foot meets the picture's foot)
  const sleeve: InstanceType<typeof Vector2>[] = [];
  for (let i = 0; i <= 16; i++) {
    const y = -0.44 + (i / 16) * 0.71;
    sleeve.push(new Vector2(r(y) + 0.0035, y));
  }
  const lid = [new Vector2(0, 0.47), new Vector2(0.26, 0.468), new Vector2(0.325, 0.452), new Vector2(0.347, 0.42), new Vector2(0.348, 0.35), new Vector2(0.338, 0.338)];
  const steel = new MeshPhysicalMaterial({ color: 0x0b5e57, metalness: 0.55, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const lidMat = new MeshStandardMaterial({ color: 0xe8e8e6, metalness: 1, roughness: 0.24 });
  const wrapCanvas = document.createElement('canvas');
  wrapCanvas.width = WRAP_W;
  wrapCanvas.height = WRAP_H;
  const wctx = wrapCanvas.getContext('2d')!;
  await document.fonts?.load('700 100px Philosopher').catch(() => undefined);
  drawWrap(wctx, '');
  const wrapTex = new CanvasTexture(wrapCanvas);
  wrapTex.colorSpace = SRGBColorSpace;
  wrapTex.wrapS = RepeatWrapping;
  wrapTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const wrapMat = new MeshStandardMaterial({ map: wrapTex, metalness: 0.05, roughness: 0.42 });
  const group = new Group();
  group.add(new Mesh(new LatheGeometry(body, 96), steel));
  group.add(new Mesh(new LatheGeometry(sleeve, 128), wrapMat));
  group.add(new Mesh(new LatheGeometry(lid, 96), lidMat));
  group.rotation.y = -Math.PI / 2; // the brand to the front at rest
  scene.add(group);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };
  new ResizeObserver(resize).observe(canvas);

  // --- the hand: drag to turn, with a little inertia
  let hand = 0;
  let handV = 0;
  let dragX: number | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    handV = 0;
    canvas.setPointerCapture(e.pointerId);
    root.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    const d = (e.clientX - dragX) / canvas.clientWidth;
    dragX = e.clientX;
    hand += d * Math.PI * 1.6;
    handV = d * Math.PI * 1.6;
  });
  const release = () => {
    dragX = null;
    root.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // --- the brand
  let pending = 0;
  input.addEventListener('input', () => {
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      drawWrap(wctx, input.value);
      wrapTex.needsUpdate = true;
      draw();
    }, 60);
  });

  let dirty = true;
  function draw() {
    dirty = true;
  }
  let shown = -1;
  onTick(() => {
    if (!visible) return;
    const p = progress();
    if (p !== ph) {
      ph = p;
      stage!.style.setProperty('--ph', p.toFixed(4));
      dirty = true;
    }
    if (dragX === null && Math.abs(handV) > 0.0004) {
      hand += handV;
      handV *= 0.94;
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    // the wrap turns half way round over the rise (agua's label: 182 degrees)
    const turn = (reduceMotion ? 0 : ph) * Math.PI * 1.01 + hand;
    group.rotation.y = -Math.PI / 2 + turn;
    group.rotation.z = 0.02;
    renderer.render(scene, camera);
    if (shown < 0) {
      shown = 1;
      root.classList.add('is-ready');
    }
  });
  resize();

  function progress() {
    const r = stage!.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 while the stage's top is low on the screen, 1 when it has gone a little past the top
    const p = Math.max(0, Math.min(1, (vh * 0.62 - r.top) / (vh * 0.62)));
    return Math.round(p * 1000) / 1000;
  }

  function scrollOnly() {
    onTick(() => {
      if (!visible) return;
      const p = progress();
      if (p !== ph) {
        ph = p;
        stage!.style.setProperty('--ph', p.toFixed(4));
      }
    });
  }
}
