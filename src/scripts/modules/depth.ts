// Depth cards (components/DepthCard.astro): the pointer drives the tilt, the parallax and the person's step forward.
// Touch screens have no hover: the person steps out once the card is well in view.
import { finePointer, reduceMotion } from '../core/env';

export default function depth(el: HTMLElement) {
  if (reduceMotion) return;
  const set = (px: number, py: number, lift: number) => {
    el.style.setProperty('--px', px.toFixed(3));
    el.style.setProperty('--py', py.toFixed(3));
    el.style.setProperty('--rx', `${(px * 7).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(-py * 5).toFixed(2)}deg`);
    el.style.setProperty('--lift', lift.toFixed(2));
  };
  if (finePointer) {
    let frame = 0;
    el.addEventListener('pointerenter', () => el.classList.add('is-active'));
    el.addEventListener('pointermove', (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * 2 - 1;
        const py = ((e.clientY - r.top) / r.height) * 2 - 1;
        set(Math.max(-1, Math.min(1, px)), Math.max(-1, Math.min(1, py)), 1);
      });
    });
    el.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      el.classList.remove('is-active');
      set(0, 0, 0);
    });
    return;
  }
  const io = new IntersectionObserver(
    (es) => {
      const on = es[es.length - 1].intersectionRatio > 0.55;
      el.classList.toggle('is-popped', on);
      set(0, on ? -0.2 : 0, on ? 0.75 : 0);
    },
    { threshold: [0, 0.55, 0.8] },
  );
  io.observe(el);
}
