// A chapter's showroom (components/Showroom.astro), after the way Agrumea's site (agua) presents its jars:
//   * the piece turns slowly in front of its name; a drag turns it by hand (it keeps the speed of the hand a moment);
//     the scroll turns it a little too, as the stage passes;
//   * the bar: the pill slides to the piece chosen; a panel in the piece's colour rises over the stage (0.55 s,
//     agua's easing), the name, the client, the photograph and the model change under it, then it lifts away (0.62 s)
//     and the new piece comes up into its place while its name rises in;
//   * "Make yours" opens the chapter's studio under the stage; "Ask about this" writes the WhatsApp message.
// three.js draws only while the stage is on screen.
import { onTick } from '../core/ticker';
import { gpuTier, glFailed, reduceMotion } from '../core/env';
import { studioEnvironment } from '../core/studio-env';
import { scrollToEl } from '../core/scroll';
import { whatsapp } from '../core/whatsapp';

interface Product {
  id: string;
  name: [string, string];
  short: string;
  client: string;
  what: string;
  photo: string;
  bg: string;
  ink: string;
  yaw?: number;
  tilt?: number;
  size?: number;
}

const COVER = 550;
const LIFT = 620;

export default async function showroom(root: HTMLElement) {
  const data = root.querySelector<HTMLScriptElement>('[data-showroom-data]');
  const stage = root.querySelector<HTMLElement>('[data-showroom-stage]');
  const canvas = root.querySelector<HTMLCanvasElement>('.showroom__canvas');
  if (!data || !stage || !canvas) return;
  const products: Product[] = JSON.parse(data.textContent || '[]');
  const items = [...root.querySelectorAll<HTMLButtonElement>('[data-showroom-item]')];
  const pill = root.querySelector<HTMLElement>('[data-showroom-pill]');
  const lines = [...root.querySelectorAll<HTMLElement>('.showroom__line > span')];
  const client = root.querySelector<HTMLElement>('[data-showroom-client]');
  const what = root.querySelector<HTMLElement>('[data-showroom-what]');
  const photos = [...root.querySelectorAll<HTMLElement>('[data-showroom-photo]')];
  const ask = root.querySelector<HTMLAnchorElement>('[data-showroom-ask]');
  const make = root.querySelector<HTMLButtonElement>('[data-showroom-make]');
  const studio = root.querySelector<HTMLElement>('[data-showroom-studio]');
  let index = 0;
  let busy = false;

  // ---- the bar's pill
  const placePill = () => {
    const b = items[index];
    if (!pill || !b) return;
    pill.style.width = `${b.offsetWidth}px`;
    pill.style.transform = `translateX(${b.offsetLeft}px)`;
    // where the bar scrolls (a phone), the piece chosen comes to its middle
    const nav = pill.parentElement;
    if (nav && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  new ResizeObserver(placePill).observe(stage);
  placePill();

  const askText = (p: Product) =>
    `Hello Raphael Studios, I saw the ${p.short} you made for ${p.client} and would like to talk about something like it for us.`;
  const setAsk = () => ask && (ask.href = whatsapp(askText(products[index])));
  setAsk();

  // ---- the 3D
  let view: Awaited<ReturnType<typeof makeView>> | null = null;
  if (gpuTier() > 0) {
    try {
      view = await makeView(canvas, stage, root);
      await view.show(products[0], false);
      root.classList.add('is-ready');
    } catch (err) {
      glFailed('showroom', err);
      view = null;
    }
  }

  // ---- going to another piece
  const go = async (next: number) => {
    if (busy || next === index || next < 0 || next >= products.length) return;
    busy = true;
    const p = products[next];
    index = next;
    items.forEach((b, i) => b.setAttribute('aria-pressed', String(i === next)));
    placePill();
    root.style.setProperty('--wipe', p.ink);
    const loading = view?.preload(p);
    if (!reduceMotion) {
      root.classList.add('is-covering');
      await wait(COVER);
    }
    // under the panel: everything changes
    root.classList.add('is-swapping');
    root.style.setProperty('--bg', p.bg);
    root.style.setProperty('--ink-p', p.ink);
    lines[0].textContent = p.name[0];
    lines[1].textContent = p.name[1];
    if (client) client.textContent = p.client;
    if (what) what.textContent = p.what;
    photos.forEach((ph, i) => ph.classList.toggle('is-on', i === next));
    canvas.setAttribute('aria-label', `${p.short} in 3D: drag to turn it`);
    setAsk();
    await Promise.race([loading, wait(1500)]);
    await view?.show(p, !reduceMotion);
    // force the reveal to start from below
    void stage.offsetWidth;
    root.classList.remove('is-swapping');
    if (!reduceMotion) {
      root.classList.remove('is-covering');
      root.classList.add('is-lifting');
      await wait(LIFT);
      root.classList.remove('is-lifting');
    }
    busy = false;
  };
  items.forEach((b, i) => b.addEventListener('click', () => go(i)));
  root.querySelector('.showroom__nav')?.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (index + (k === 'ArrowRight' ? 1 : -1) + products.length) % products.length;
    go(n).then(() => items[n].focus());
  });

  // ---- make yours: the studio opens under the stage
  make?.addEventListener('click', () => {
    const open = !root.classList.contains('is-making');
    root.classList.toggle('is-making', open);
    make.setAttribute('aria-expanded', String(open));
    make.textContent = open ? 'Close the studio' : 'Make yours';
    if (open && studio) setTimeout(() => scrollToEl(studio, -40), 260);
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function makeView(canvas: HTMLCanvasElement, stage: HTMLElement, root: HTMLElement) {
  const three = await import('three');
  const { gltfLoader } = await import('../stage/loaders');
  const { WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Group, Box3, Vector3, SRGBColorSpace, NeutralToneMapping, AnimationMixer, LoopOnce } = three;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gpuTier() === 2 ? 2 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.8; // (bright dyes keep their colour: an orange stays orange)
  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.05, 30);
  camera.position.set(0, 0.08, 3.3);
  camera.lookAt(0, 0, 0);
  // a studio's light: a soft fill, a key from the upper right, a cool rim behind (true colours: nothing washes out)
  scene.add(new HemisphereLight(0xffffff, 0x6d675c, 0.55));
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(2.2, 3, 4);
  scene.add(key);
  const fill = new DirectionalLight(0xfff4e6, 0.45);
  fill.position.set(-3, 0.5, 3);
  scene.add(fill);
  const rim = new DirectionalLight(0xe9f6f4, 0.9);
  rim.position.set(-3, 1.2, -2.5);
  scene.add(rim);
  studioEnvironment().then((env) => {
    if (env) scene.environment = env;
    dirty = true;
  });
  const holder = new Group(); // turns
  const lift = new Group(); // rises into place on a change
  lift.add(holder);
  scene.add(lift);
  const loader = gltfLoader(renderer);
  const cache = new Map<string, Promise<InstanceType<typeof Group>>>();
  const load = (p: Product) => {
    if (!cache.has(p.id)) {
      cache.set(
        p.id,
        loader.loadAsync(`/showroom/${p.id}.glb`).then((g) => {
          const obj = g.scene;
          // centred, a metre tall at most (or a metre across), then the piece's own size; measured on its body when
          // it has one (a strap or a handle reaching out does not make the bag smaller)
          const box = new Box3().setFromObject(obj.getObjectByName('body') ?? obj);
          const size = box.getSize(new Vector3());
          const centre = box.getCenter(new Vector3());
          const k = (1.0 / Math.max(size.y, size.x * 0.82, size.z * 0.82)) * (p.size ?? 1);
          obj.position.sub(centre).multiplyScalar(k);
          obj.scale.setScalar(k);
          // cloth hardly mirrors the room: its reflections kept faint (the prefiltered room's seams would show
          // as fine lines on a dark cotton)
          obj.traverse((o) => {
            const m = (o as { material?: { roughness?: number; envMapIntensity?: number } }).material;
            if (m && (m.roughness ?? 0) > 0.8) m.envMapIntensity = 0.2;
          });
          const wrap = new Group();
          wrap.add(obj);
          wrap.rotation.x = p.tilt ?? 0;
          // what it does when it comes on (a bag's doors opening): played once each time it is shown
          if (g.animations.length) {
            const mixer = new AnimationMixer(obj);
            const actions = g.animations.map((c) => mixer.clipAction(c).setLoop(LoopOnce, 1));
            actions.forEach((a) => (a.clampWhenFinished = true));
            wrap.userData.play = () => {
              mixer.stopAllAction();
              actions.forEach((a) => a.reset().play());
              mixer.setTime(0);
            };
            wrap.userData.mixer = mixer;
          }
          return wrap;
        }),
      );
    }
    return cache.get(p.id)!;
  };

  let current: InstanceType<typeof Group> | null = null;
  let baseYaw = 0;
  let swayT = 0;
  let entryT = 1;
  let dirty = true;
  // its clips start the first time it is on screen after it is shown
  let toPlay = false;
  const show = async (p: Product, animate: boolean) => {
    const obj = await load(p);
    if (current) holder.remove(current);
    current = obj;
    holder.add(obj);
    baseYaw = p.yaw ?? 0;
    hand = 0;
    handV = 0;
    swayT = 0;
    entryT = animate ? 0 : 1;
    toPlay = Boolean(obj.userData.play);
    (obj.userData.mixer as InstanceType<typeof AnimationMixer> | undefined)?.setTime(0);
    dirty = true;
  };
  const preload = (p: Product) => load(p).then(() => undefined);

  // ---- the hand
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
    const d = ((e.clientX - dragX) / canvas.clientWidth) * Math.PI * 1.6;
    dragX = e.clientX;
    hand += d;
    handV = d;
    dirty = true;
  });
  const release = () => {
    dragX = null;
    root.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the piece fits the height; on a narrow stage, the width
    camera.position.z = Math.max(3.3, 3.3 * (0.9 / camera.aspect));
    camera.updateProjectionMatrix();
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = false;
  // (the latest entry: a batch can hold an older one first)
  new IntersectionObserver((e) => (visible = e[e.length - 1].isIntersecting), { rootMargin: '10% 0px' }).observe(stage);
  let auto = 0;
  let last = performance.now();
  onTick(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || !current) return;
    if (toPlay) {
      toPlay = false;
      if (reduceMotion) {
        current.userData.play();
        (current.userData.mixer as InstanceType<typeof AnimationMixer>).setTime(60);
      } else current.userData.play();
    }
    (current.userData.mixer as InstanceType<typeof AnimationMixer> | undefined)?.update(dt);
    // when nobody holds it, a slow sway either side of its best side (its print always in view); the hand turns it
    // right round
    if (dragX === null && !reduceMotion) {
      if (Math.abs(handV) > 0.0004) {
        hand += handV;
        handV *= 0.94;
      } else {
        swayT += dt;
        auto = Math.sin(swayT * 0.42) * 0.45;
      }
    }
    // the scroll: a little turn as the stage passes
    const r = stage.getBoundingClientRect();
    const passing = Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight));
    if (entryT < 1) entryT = Math.min(1, entryT + dt / 0.9);
    const e = 1 - Math.pow(1 - entryT, 3);
    holder.rotation.y = baseYaw + auto + hand + passing * 0.5 + (1 - e) * 0.7;
    lift.position.y = -(1 - e) * 0.28;
    renderer.render(scene, camera);
    dirty = false;
  });
  return { show, preload };
}
