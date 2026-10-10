// Where the reader is in the story. The page is a run of sections (the hero, then one per chapter), each with its own
// painted scene. For a scroll position this gives the current section and its progress, and - while the next
// chapter's opening comes up the screen - the next section and how far the transition between the two has gone.
//
//   progress   0..1 over the section's height + one viewport (0 when its top meets the bottom of the screen)
//   transition 0..1 over the next section's opener ("hero") height, from the moment it enters the screen

export interface SectionInfo {
  index: number;
  id: string;
  el: HTMLElement;
  /** the block whose height the transition into this section lasts (its title and painted opener) */
  opener: HTMLElement | null;
  top: number;
  height: number;
  openerHeight: number;
  /** start the transition this many viewport heights early */
  earlyCrossfade: number;
}

export interface SectionState {
  current: number;
  progress: number;
  next: number | null;
  nextProgress: number;
  transition: number;
}

export class Sections {
  list: SectionInfo[] = [];
  vh = 1;
  /** false until the first measure (which waits for an idle moment: it lays the whole page out) */
  measured = false;

  constructor(root: ParentNode = document) {
    const els = [...root.querySelectorAll<HTMLElement>('[data-section-id]')];
    this.list = els.map((el, index) => ({
      index,
      id: el.dataset.sectionId!,
      el,
      opener: el.querySelector<HTMLElement>('[data-section-opener]'),
      top: 0,
      height: 0,
      openerHeight: 0,
      earlyCrossfade: index >= 2 ? 0.2 : 0,
    }));
  }

  /** Reads the layout. Call on load, resize and when content above changes size (not every frame). */
  measure() {
    this.measured = true;
    this.vh = window.innerHeight;
    let top = 0;
    for (const s of this.list) {
      s.height = s.el.offsetHeight;
      s.openerHeight = s.opener ? s.opener.offsetHeight : 0;
      // sections are consecutive in the page: their offsets follow from the heights
      s.top = top;
      top += s.height;
    }
  }

  /** The documented scroll offset of a section's top (for the index links). */
  topOf(index: number) {
    return this.list[index]?.top ?? 0;
  }

  state(scrollY: number): SectionState {
    // before the first measure the page is at its top: the hero, at rest
    if (!this.measured) return { current: 0, progress: 0.4, next: null, nextProgress: 0, transition: 0 };
    const vh = this.vh;
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const s = this.list[i];
      const early = vh * s.earlyCrossfade;
      const start = s.top - vh - early;
      const end = s.top + s.height;
      if (scrollY < end) {
        const progress = clamp((scrollY - start) / (s.height + vh + early));
        let next: number | null = null;
        let nextProgress = 0;
        let transition = 0;
        const ns = this.list[i + 1];
        if (ns) {
          const nEarly = vh * ns.earlyCrossfade;
          const nStart = s.top + s.height - vh - nEarly;
          const k = clamp((scrollY - nStart) / (ns.height + vh + nEarly));
          if (k > 0) {
            next = i + 1;
            nextProgress = k;
            // the burn into the next painting starts once the paper has mostly gone (the next section's top is
            // past two thirds of the screen) and is done after most of a screen more
            transition = clamp((scrollY - (ns.top - vh * 0.35)) / (vh * 0.9));
          }
        }
        return { current: i, progress, next, nextProgress, transition };
      }
    }
    return { current: n - 1, progress: 1, next: null, nextProgress: 0, transition: 0 };
  }

  /** timeline position (viewport heights since the section entered the screen) for a section progress */
  position(index: number, progress: number) {
    const s = this.list[index];
    if (!s) return 0;
    if (!this.measured) return 1; // the hero's resting point
    return Math.max(0, (progress * (s.height + this.vh)) / this.vh);
  }
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
