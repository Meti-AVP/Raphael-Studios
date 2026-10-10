// Entry on every page: smooth scroll, reveals, the cursor, on-demand modules, the side-and-lines layer, and the
// stage (the painted scenes), which loads its code only where WebGL2 is available.
import { initScroll, scrollY } from './core/scroll';
import { onTick } from './core/ticker';
import { initReveal } from './core/reveal';
import { initCursor } from './core/cursor';
import { initModules } from './core/modules';
import { initSidebar } from './core/sidebar';
import { initMenu } from './core/menu';
import { finePointer, gpuTier, reduceMotion } from './core/env';

const sidebar = initSidebar();
initScroll();
initReveal();
initCursor();
initModules();
initMenu();

const canvas = document.querySelector<HTMLCanvasElement>('canvas.stage');
const html = document.documentElement;
if (!canvas || html.classList.contains('no-stage')) {
  sidebar.setLoaded();
} else {
  // the painting's engine loads once the opening text is on screen in its own font: the first paint stays light
  const go = () => startStage(canvas);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  document.fonts.ready.then(() => (idle ? idle(go, { timeout: 400 }) : setTimeout(go, 50)));
}

async function startStage(canvas: HTMLCanvasElement) {
  const tier = gpuTier();
  // ?poster: the stills of each scene are rendered from this page (tools/scenes/posters.mjs): 3D everywhere, no UI
  const posterMode = import.meta.env.DEV && new URLSearchParams(location.search).has('poster');
  if (posterMode) html.classList.add('poster-mode');
  const { Stage } = await import('./stage/stage');
  // the engine's code has just run: creating the renderer waits for the next task, so neither makes a long one
  await new Promise((r) => setTimeout(r, 0));
  let stage: InstanceType<typeof Stage>;
  try {
    stage = new Stage({
      canvas,
      use3d: posterMode || (tier === 2 && !reduceMotion),
      mobile: !finePointer && !posterMode,
      maxDpr: posterMode ? 2 : tier === 2 ? 1.5 : 1.25,
      scrollY,
      noPaper: posterMode,
    });
  } catch (err) {
    console.info('[stage] WebGL unavailable, showing the paper version', err);
    html.classList.add('no-stage');
    sidebar.setLoaded();
    return;
  }
  const { provideStage } = await import('./stage/handle');
  provideStage(stage);
  stage.onFirstScene = () => sidebar.setLoaded();
  stage.onHeroReady = () => (posterMode ? undefined : stage.playIntro());
  if (posterMode) (window as unknown as { __stage: unknown }).__stage = stage;

  let lastW = window.innerWidth;
  let lastH = window.innerHeight;
  window.addEventListener('resize', () => {
    // phones resize on every toolbar show/hide: only real changes re-measure
    if (Math.abs(window.innerWidth - lastW) < 2 && Math.abs(window.innerHeight - lastH) < 120) return;
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    stage.resize();
  });
  // content that changes height (fonts, pictures without sizes) moves the sections: measure again
  let measureTimer = 0;
  new ResizeObserver(() => {
    if (!stage.sections.measured) return; // the first measure comes when the browser is idle
    clearTimeout(measureTimer);
    measureTimer = window.setTimeout(() => stage.measure(), 120);
  }).observe(document.getElementById('main')!);
  document.fonts.ready.then(() => stage.sections.measured && stage.measure());

  onTick((time, dt) => {
    stage.frame(time, dt);
    const y = scrollY();
    sidebar.setScrolled(y > 40);
    sidebar.setSection(stage.activeIndex);
    sidebar.setOverlay(stage.overlay);
  });
}
