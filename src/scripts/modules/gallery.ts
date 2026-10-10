// The work ribbon (components/Gallery.astro). The feel is the one of the slider on Agrumea's site (agua, one of the
// brief's references), measured on it and written here anew:
//   * the ribbon does not jump to the pointer: each frame it covers 5% of the way to where it should be (a soft,
//     heavy follow), so a drag feels like moving something with weight;
//   * let go, and the speed of the last moments goes on (x16) and fades by 7% a frame;
//   * the pictures repeat without end (the ribbon wraps around);
//   * inside its window each photograph slides against the motion, more the further it is from the centre (a curve
//     that eases near the middle), so the window seems to look at something further back;
//   * a press that moved more than 8 px is a drag, not a click; the arrow keys move one picture.
import { reduceMotion } from '../core/env';

const FOLLOW = 0.05;
const DECAY = 0.93;
const THROW = 16;
const CLICK = 8;
const CURVE = 0.84;
const REACH = 0.78;

export default function gallery(root: HTMLElement) {
  const track = root.querySelector<HTMLElement>('[data-ribbon-track]');
  if (!track) return;
  const originals = [...track.querySelectorAll<HTMLElement>('[data-ribbon-slide]')];
  if (!originals.length) return;
  let slides: HTMLElement[] = [];
  let imgs: HTMLElement[] = [];
  let bleed: number[] = [];
  const g = { slideW: 0, step: 0, total: 0, half: 0, w: 0 };
  const s = { id: -1, startX: 0, startAt: 0, lastX: 0, lastT: 0, dist: 0, vel: 0, momentum: 0, at: 0, to: 0, raf: 0 };
  let dragging = false;
  let swallowClick = false;

  // enough copies to fill twice the width, so the wrap never shows
  const layout = () => {
    const first = originals[0];
    g.w = track.clientWidth;
    g.slideW = first.offsetWidth;
    const gap = parseFloat(getComputedStyle(track).getPropertyValue('--gap')) || 40;
    g.step = g.slideW + gap;
    const need = Math.ceil((g.w * 2) / g.step) + 2;
    const copies = Math.max(1, Math.ceil(need / originals.length));
    const have = track.querySelectorAll('[data-ribbon-slide]').length / originals.length;
    for (let c = have; c < copies; c++) {
      for (const o of originals) {
        const k = o.cloneNode(true) as HTMLElement;
        k.setAttribute('aria-hidden', 'true');
        k.querySelectorAll('img').forEach((i) => (i.alt = ''));
        track.appendChild(k);
      }
    }
    slides = [...track.querySelectorAll<HTMLElement>('[data-ribbon-slide]')];
    imgs = slides.map((sl) => sl.querySelector<HTMLElement>('.ribbon__img') ?? sl);
    bleed = imgs.map((im) => Math.max(0, (im.offsetWidth - g.slideW) / 2));
    g.total = slides.length * g.step;
    g.half = g.total / 2;
    place(s.at);
    root.classList.add('is-ready');
  };

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const place = (at: number) => {
    if (!g.total) return;
    const left = g.w / 2 - g.slideW / 2;
    const reach = ((g.w + g.slideW) / 2) * REACH;
    for (let i = 0; i < slides.length; i++) {
      let u = i * g.step - at;
      u = ((u % g.total) + g.total) % g.total;
      if (u > g.half) u -= g.total;
      slides[i].style.transform = `translate3d(${left + u}px,0,0)`;
      if (!reduceMotion && bleed[i]) {
        const a = reach ? clamp(-u / reach, -1, 1) : 0;
        const shift = (a === 0 ? 0 : Math.sign(a) * Math.pow(Math.abs(a), CURVE)) * bleed[i];
        imgs[i].style.transform = `translate3d(calc(-50% + ${shift}px),0,0)`;
      }
    }
  };

  const frame = () => {
    s.raf = 0;
    if (!dragging && Math.abs(s.momentum) > 0.05) {
      s.to += s.momentum;
      s.momentum *= DECAY;
      if (Math.abs(s.momentum) < 0.05) s.momentum = 0;
    }
    s.at += (s.to - s.at) * FOLLOW;
    if (Math.abs(s.to - s.at) < 0.4 && !s.momentum) s.at = s.to;
    place(s.at);
    if (dragging || Math.abs(s.to - s.at) >= 0.4 || s.momentum) s.raf = requestAnimationFrame(frame);
  };
  const run = () => {
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  };

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    root.classList.add('is-dragging');
    s.id = e.pointerId;
    s.startX = s.lastX = e.clientX;
    s.startAt = s.to;
    s.lastT = e.timeStamp || performance.now();
    s.dist = 0;
    s.vel = 0;
    s.momentum = 0;
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== s.id) return;
    const dx = e.clientX - s.startX;
    const t = e.timeStamp || performance.now();
    const dt = Math.max(1, t - s.lastT);
    s.vel = s.vel * 0.76 + ((e.clientX - s.lastX) / dt) * 0.24;
    s.lastX = e.clientX;
    s.lastT = t;
    s.dist = Math.max(s.dist, Math.abs(dx));
    s.to = s.startAt - dx;
    run();
  });
  const end = (e: PointerEvent) => {
    if (!dragging || (s.id !== -1 && e.pointerId !== s.id)) return;
    dragging = false;
    root.classList.remove('is-dragging');
    track.releasePointerCapture?.(e.pointerId);
    s.id = -1;
    s.momentum = reduceMotion ? 0 : -s.vel * THROW;
    run();
    if (s.dist > CLICK) {
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
    }
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener(
    'click',
    (e) => {
      if (swallowClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  track.addEventListener('dragstart', (e) => e.preventDefault());
  track.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    s.momentum = 0;
    s.to += d * g.step;
    run();
  });
  // pictures arrive lazily: measure again when one does, and whenever the ribbon changes size
  track.addEventListener('load', () => layout(), true);
  new ResizeObserver(() => layout()).observe(track);
  layout();
}
