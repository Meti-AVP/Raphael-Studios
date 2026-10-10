// A small turquoise dot that follows the mouse with a little lag, and grows into a labelled pill over
// elements with data-cursor="Label" (Drag, View, Play…). Mouse and trackpad only.
import { finePointer, reduceMotion } from './env';
import { onTick } from './ticker';

export function initCursor() {
  const el = document.querySelector<HTMLElement>('.cursor');
  if (!el || !finePointer) return;
  const label = el.querySelector<HTMLElement>('.cursor__label')!;
  document.documentElement.classList.add('has-cursor');
  let x = -100;
  let y = -100;
  let cx = x;
  let cy = y;
  let shown = false;

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!shown) {
        shown = true;
        cx = x;
        cy = y;
        el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
        el.classList.add('is-visible');
      }
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    shown = false;
    el.classList.remove('is-visible');
  });
  document.addEventListener('pointerover', (e) => {
    const target = (e.target as Element).closest?.('[data-cursor], a, button, [role="button"], input, label, select, textarea');
    const text = target?.getAttribute('data-cursor') || '';
    el.classList.toggle('is-label', !!text);
    el.classList.toggle('is-link', !!target && !text);
    if (text) label.textContent = text;
  });
  window.addEventListener('pointerdown', () => el.classList.add('is-down'));
  window.addEventListener('pointerup', () => el.classList.remove('is-down'));

  const k = reduceMotion ? 1 : 0.22;
  onTick(() => {
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return; // resting: no style write
    cx += dx * k;
    cy += dy * k;
    el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
  });
}
