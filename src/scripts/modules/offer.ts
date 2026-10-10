// The services list (components/Offer.astro): on a computer, a picture of the work follows the pointer over the
// lines, a little behind it and leaning with its speed, and changes with the line under it.
import { onTick } from '../core/ticker';
import { finePointer, reduceMotion } from '../core/env';

export default function offer(root: HTMLElement) {
  if (!finePointer || reduceMotion) return;
  const float = root.querySelector<HTMLElement>('.offer__float');
  const pics = [...root.querySelectorAll<HTMLElement>('.offer__pic')];
  const rows = [...root.querySelectorAll<HTMLElement>('[data-offer-row]')];
  if (!float || !pics.length || !rows.length) return;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let on = false;
  let shown = -1;
  const show = (i: number) => {
    if (i === shown) return;
    shown = i;
    pics.forEach((p, k) => p.classList.toggle('is-on', k === i));
  };
  for (const row of rows) {
    row.addEventListener('pointerenter', () => {
      on = true;
      float.classList.add('is-on');
      show(Number(row.dataset.offerRow));
    });
  }
  root.querySelector('.offer__list')?.addEventListener('pointerleave', () => {
    on = false;
    float.classList.remove('is-on');
  });
  root.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    tx = e.clientX - r.left;
    ty = e.clientY - r.top;
  });
  onTick(() => {
    if (!on && !float.classList.contains('is-on')) return;
    const dx = tx - x;
    x += dx * 0.14;
    y += (ty - y) * 0.14;
    float.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${Math.max(-8, Math.min(8, dx * 0.06)).toFixed(2)}deg)`;
  });
}
