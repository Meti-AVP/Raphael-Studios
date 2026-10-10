// A draggable strip of work: pull it with the mouse or a finger, it keeps its momentum and settles; the cards lean
// with the speed (the drag effect of the reference sites). Native vertical scrolling keeps working on touch.
import { onTick } from '../core/ticker';
import { reduceMotion } from '../core/env';

export default function strip(root: HTMLElement) {
  const track = root.querySelector<HTMLElement>('[data-strip-track]');
  if (!track) return;
  const cards = [...track.children] as HTMLElement[];
  let x = 0;
  let target = 0;
  let v = 0;
  let min = 0;
  let dragging = false;
  let startX = 0;
  let startT = 0;
  let lastX = 0;
  let lastTime = 0;
  let moved = false;

  const measure = () => {
    const w = track.scrollWidth;
    min = Math.min(0, root.clientWidth - w);
  };
  measure();
  new ResizeObserver(measure).observe(root);

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startT = target;
    lastX = e.clientX;
    lastTime = performance.now();
    v = 0;
    track.setPointerCapture(e.pointerId);
    track.style.cursor = 'grabbing';
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    let t = startT + dx;
    if (t > 0) t *= 0.35;
    if (t < min) t = min + (t - min) * 0.35;
    target = t;
    const now = performance.now();
    v = ((e.clientX - lastX) / Math.max(1, now - lastTime)) * 16;
    lastX = e.clientX;
    lastTime = now;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    track.style.cursor = '';
    target = Math.max(min, Math.min(0, target + v * 18));
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  // a drag is not a click
  track.addEventListener('click', (e) => moved && e.preventDefault(), true);

  let visible = false;
  new IntersectionObserver((e) => (visible = e[e.length - 1].isIntersecting)).observe(root);
  onTick((_, dt) => {
    if (!visible) return;
    const k = reduceMotion ? 1 : 1 - Math.pow(0.86, dt * 60);
    const prev = x;
    x += (target - x) * k;
    if (Math.abs(x - prev) < 0.01 && !dragging) return;
    const speed = (x - prev) / Math.max(dt, 1 / 120) / 1000;
    const lean = Math.max(-6, Math.min(6, -speed * 3));
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    for (const c of cards) c.style.transform = `skewX(${lean.toFixed(2)}deg)`;
  });
}
