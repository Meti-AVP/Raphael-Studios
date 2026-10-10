// The side-and-lines layer's states (see components/SideAndLines.astro):
//   initiated -> loaded (first scene ready) -> ready (frame complete) ; scrolled ; active line group ; active chapter
// and the colour themes of the fixed parts. The paper wipes up from the bottom and away towards the top, so the
// index (bottom left), the title (top left) and the bar (top) each turn to ink at their own moment:
//   html[data-side-theme|data-title-theme|data-nav-theme] = 'paper' | 'paint'
import { lineGroups } from '../../content/edition';

export interface SidebarApi {
  setLoaded(): void;
  setSection(index: number): void;
  setScrolled(scrolled: boolean): void;
  /** the paper's position, -1 (below the screen) .. 0 (covering) .. 1 (gone above) */
  setOverlay(overlay: number): void;
}

export function initSidebar(): SidebarApi {
  const root = document.querySelector<HTMLElement>('.sal');
  const lines = root?.querySelector<SVGElement>('.sal__lines');
  const items = [...(root?.querySelectorAll<HTMLLIElement>('.sal__index li') ?? [])];
  const html = document.documentElement;
  html.dataset.sideTheme = html.dataset.titleTheme = html.dataset.navTheme = 'paint';
  if (!root || !lines) {
    return { setLoaded() {}, setSection() {}, setScrolled() {}, setOverlay() {} };
  }
  const shown = new Set<number>();
  let loaded = false;
  let current = -1;
  const themes = { side: 'paint', title: 'paint', nav: 'paint' };

  // the first group of lines (hero) is drawn from the first paint by the markup itself
  shown.add(lineGroups[0]);
  current = 0;

  function setSection(index: number) {
    if (index === current) return;
    current = index;
    const group = lineGroups[index] ?? 7;
    const first = !shown.has(group);
    shown.add(group);
    lines!.dataset.active = String(group);
    lines!.dataset.animating = first ? String(group) : '';
    // hero = 0; chapters 1..13 map to the index items
    items.forEach((li, i) => li.classList.toggle('is-active', i === index - 1));
  }

  function setLoaded() {
    if (loaded) return;
    loaded = true;
    root!.dataset.loaded = 'true';
    // when the frame's line has completed, the frame is "ready": the lines fade, the index appears
    const complete = root!.querySelector<SVGRectElement>('.sal__complete');
    const done = () => {
      root!.dataset.ready = 'true';
      // after the staggered fade-in, the inactive chapters dim
      window.setTimeout(() => (root!.dataset.done = 'true'), 75 * items.length + 700);
    };
    const anims = complete?.getAnimations?.() ?? [];
    if (anims.length) Promise.all(anims.map((a) => a.finished)).then(done, done);
    else window.setTimeout(done, 1000);
  }

  function theme(key: keyof typeof themes, attr: 'sideTheme' | 'titleTheme' | 'navTheme', paper: boolean) {
    const t = paper ? 'paper' : 'paint';
    if (themes[key] === t) return;
    themes[key] = t;
    html.dataset[attr] = t;
  }

  return {
    setLoaded,
    setSection,
    setScrolled(scrolled: boolean) {
      const v = scrolled ? 'true' : 'false';
      if (root.dataset.scrolled !== v) root.dataset.scrolled = v;
    },
    setOverlay(p: number) {
      theme('side', 'sideTheme', p >= -0.85 && p <= 0.15);
      theme('title', 'titleTheme', p >= -0.3 && p <= 0.7);
      theme('nav', 'navTheme', p >= -0.25 && p <= 0.75);
    },
  };
}
