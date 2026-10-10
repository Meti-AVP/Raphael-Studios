// Smooth scrolling (Lenis) for mouse and trackpad. Touch keeps the native scroll: it is already smooth there,
// and taking it over costs battery and feels wrong. Everything that reacts to scroll subscribes here.
import Lenis from 'lenis';
import { finePointer, reduceMotion } from './env';
import { onTick } from './ticker';

type ScrollFn = (y: number, velocity: number) => void;
const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
const maybeScrolled = navType === 'reload' || navType === 'back_forward' || location.hash.length > 1;
const listeners = new Set<ScrollFn>();
let lenis: Lenis | null = null;
let lastY = -1;
/** the scroll position as of the last scroll event: reading window.scrollY in an animation frame can force the
 *  browser to lay the whole page out first, so frames read this instead */
let cachedY = 0;

export function initScroll() {
  if (finePointer && !reduceMotion) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, autoRaf: false });
    lenis.on('scroll', () => emit());
    onTick((time) => lenis!.raf(time));
  } else {
    window.addEventListener('scroll', () => emit(), { passive: true });
  }
  // a page opened part-way down (reload, back, #anchor): one reading when the browser is idle
  if (maybeScrolled) {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    const read = () => {
      if (!lenis) cachedY = window.scrollY;
    };
    if (idle) idle(read, { timeout: 500 });
    else setTimeout(read, 100);
  }
  // anchors: scroll there with the same easing (and keep the header out of the way)
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[href*="#"]') as HTMLAnchorElement | null;
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname) return;
    const target = a.hash ? document.getElementById(decodeURIComponent(a.hash.slice(1))) : null;
    if (!target) return;
    e.preventDefault();
    scrollToEl(target);
    history.pushState(null, '', a.hash);
  });
  // no reading at start: at the top of the page every listener's default state is already right, and
  // measuring the page now would force a layout while it is still being built (a long task on phones)
}

function emit() {
  const y = lenis ? lenis.scroll : window.scrollY;
  cachedY = y;
  const v = lenis ? lenis.velocity : y - (lastY < 0 ? y : lastY);
  lastY = y;
  for (const fn of listeners) fn(y, v);
}

export function onScroll(fn: ScrollFn): () => void {
  listeners.add(fn);
  // a page opened part-way down (reload, back button, #anchor) gets its first reading when the browser is idle;
  // a fresh visit starts at the top, where every listener's default state is already right. (Not even
  // scrollY is read then: reading it forces a layout of the page while it is still being built.)
  if (maybeScrolled && scrollY() > 0) {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    const first = () => listeners.has(fn) && fn(scrollY(), 0);
    if (idle) idle(first, { timeout: 500 });
    else setTimeout(first, 100);
  }
  return () => listeners.delete(fn);
}

export function scrollY(): number {
  return lenis ? lenis.scroll : cachedY;
}

export function scrollToEl(el: Element, offset = 0) {
  // chapters far away are laid out only when they come near (content-visibility), so the page can grow under a long
  // jump: after it lands, check where the target is and finish the trip (a few times at most)
  let tries = 0;
  const go = (smooth: boolean) => {
    const top = el.getBoundingClientRect().top + scrollY() + offset;
    const done = () => {
      const off = el.getBoundingClientRect().top + offset;
      if (Math.abs(off) > 4 && ++tries < 4) go(false);
    };
    if (lenis) lenis.scrollTo(top, { duration: smooth ? 1.6 : 0.45, easing: (t) => 1 - Math.pow(1 - t, 4), onComplete: () => requestAnimationFrame(done) });
    else {
      window.scrollTo({ top, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
      const end = () => requestAnimationFrame(done);
      if ('onscrollend' in window) window.addEventListener('scrollend', end, { once: true });
      else setTimeout(end, smooth ? 900 : 60);
    }
  };
  go(true);
}

export function lockScroll(locked: boolean) {
  if (lenis) (locked ? lenis.stop() : lenis.start());
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}
