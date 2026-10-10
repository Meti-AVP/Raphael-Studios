// The visualization studio: the line between the drawing and the render (a slider: drag it, or use the arrow
// keys), the kiosk in 3D where the device can draw it, its brand and colour, and the request.
import { onTick } from '../core/ticker';
import { finePointer, gpuTier, reduceMotion } from '../core/env';
import { whatsapp } from '../core/whatsapp';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default async function viz(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>('.viz__stage');
  const handle = root.querySelector<HTMLElement>('[data-viz-handle]');
  const canvas = root.querySelector<HTMLCanvasElement>('.viz__canvas');
  const form = root.querySelector<HTMLFormElement>('[data-viz-form]');
  if (!stage || !handle || !canvas || !form) return;
  const sweepBtn = root.querySelector<HTMLButtonElement>('[data-viz-sweep]')!;
  const hint = root.querySelector<HTMLElement>('[data-viz-hint]');
  if (hint && !finePointer) hint.textContent = 'Slide the line · swipe sideways to turn';

  let split = 0.42;
  let view: { setSplit(f: number): void; setBrand(b: { name?: string; colour?: string }): void; frame(): void; resize(): void } | null = null;
  const set = (f: number) => {
    split = Math.max(0, Math.min(1, f));
    root.style.setProperty('--split', `${(split * 100).toFixed(2)}%`);
    const pct = Math.round(split * 100);
    handle.setAttribute('aria-valuenow', String(pct));
    handle.setAttribute('aria-valuetext', `${pct}% drawn`);
    view?.setSplit(split);
  };

  // the line: dragged by its handle (or anywhere close to it), or moved with the keys
  let anim: { from: number; to: number; t0: number; dur: number } | null = null;
  let dragging = false;
  const fromEvent = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  };
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    dragging = true;
    anim = null;
  });
  handle.addEventListener('pointermove', (e) => dragging && set(fromEvent(e)));
  const stop = () => (dragging = false);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(split - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(split + step);
    else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(1);
    else return;
    e.preventDefault();
    anim = null;
  });
  const sweep = (to: number, dur = 2200) => {
    if (reduceMotion) return set(to);
    anim = { from: split, to, t0: performance.now(), dur };
  };
  onTick((now) => {
    if (anim) {
      const t = Math.min(1, (now - anim.t0) / anim.dur);
      set(anim.from + (anim.to - anim.from) * ease(t));
      if (t >= 1) anim = null;
    }
    view?.frame();
  });
  root.classList.add('is-live');

  // "Render it": the line runs across, everything becomes the render; again, everything becomes the drawing
  sweepBtn.addEventListener('click', () => {
    const toRender = split > 0.02;
    sweep(toRender ? 0 : 1, 1800);
    sweepBtn.textContent = toRender ? 'Draw it' : 'Render it';
  });

  // the first time it is in view: from the drawing to the render, stopping halfway
  const io = new IntersectionObserver(
    (es) => {
      if (!es[es.length - 1].isIntersecting) return;
      io.disconnect();
      set(0.96);
      setTimeout(() => sweep(0.42, 2400), 350);
    },
    { threshold: 0.55 },
  );
  io.observe(stage);

  // the request
  const val = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLInputElement | null)?.value ?? '';
  const order = root.querySelector<HTMLAnchorElement>('[data-viz-order]');
  const updateOrder = () => {
    if (!order) return;
    const name = val('text').trim();
    const msg = `Hello Raphael Studios, we would like a 3D visualization of ${name ? `a ${name}` : 'our'} kiosk, booth or point of sale before we build it.`;
    order.href = whatsapp(msg);
  };
  updateOrder();

  // the 3D, where the device can draw it (otherwise the line splits the photo and its drawing)
  if (gpuTier() === 0) {
    form.addEventListener('input', updateOrder);
    return;
  }
  const { VizView } = await import('../viz/view');
  const v = new VizView({ canvas, quality: gpuTier() === 2 ? 'hi' : 'lo', onReady: () => root.classList.add('is-ready') });
  try {
    await v.init();
  } catch (err) {
    console.info('[visualization] 3D unavailable, the photo stays', err);
    form.addEventListener('input', updateOrder);
    return;
  }
  view = v;
  v.setSplit(split);
  new ResizeObserver(() => v.resize()).observe(canvas);
  let raf = 0;
  form.addEventListener('input', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      v.setBrand({ name: val('text'), colour: val('colour') });
      updateOrder();
    });
  });
}
