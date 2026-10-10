// Reveal-on-scroll: [data-reveal] elements get `.is-in` the first time they enter the viewport.
// 'lines' and 'chars' are split into masked spans first. Splitting is lazy (just before an element comes into
// view, never all at load) and 'lines' measures the real wrapping, so it waits for the web fonts.
import { reduceMotion } from './env';

const SPLIT = 'is-split';

function wrapWords(el: HTMLElement) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const t of texts) {
    const frag = document.createDocumentFragment();
    for (const p of t.data.split(/(\s+)/)) {
      if (!p) continue;
      if (/^\s+$/.test(p)) frag.append(' ');
      else {
        const w = document.createElement('span');
        w.className = 'rv-w';
        w.textContent = p;
        frag.append(w);
      }
    }
    t.replaceWith(frag);
  }
}

function splitLines(el: HTMLElement) {
  if (!el.dataset.source) el.dataset.source = el.innerHTML;
  else el.innerHTML = el.dataset.source;
  const label = el.textContent?.replace(/\s+/g, ' ').trim() || '';
  wrapWords(el);
  // one layout read for the whole element
  const words = [...el.querySelectorAll<HTMLElement>('.rv-w')];
  const tops = words.map((w) => w.offsetTop);
  const lines: HTMLElement[][] = [];
  let top = Number.NaN;
  words.forEach((w, i) => {
    if (Number.isNaN(top) || Math.abs(tops[i] - top) > 2) {
      lines.push([]);
      top = tops[i];
    }
    lines[lines.length - 1].push(w);
  });
  const out = document.createDocumentFragment();
  lines.forEach((ws, i) => {
    const mask = document.createElement('span');
    mask.className = 'rv-mask rv-line';
    const ink = document.createElement('span');
    ink.className = 'rv-ink';
    ink.style.setProperty('--i', String(i));
    ws.forEach((w, j) => {
      // keep inline formatting (<b>, <em>) by cloning the parents between the word and the element
      let node: Node = w.cloneNode(true);
      let parent = w.parentElement;
      while (parent && parent !== el) {
        const clone = parent.cloneNode(false) as HTMLElement;
        clone.append(node);
        node = clone;
        parent = parent.parentElement;
      }
      ink.append(node);
      if (j < ws.length - 1) ink.append(' ');
    });
    mask.append(ink);
    out.append(mask);
  });
  el.replaceChildren(out);
  el.setAttribute('aria-label', label);
}

function splitChars(el: HTMLElement) {
  const text = el.textContent || '';
  el.setAttribute('aria-label', text.trim());
  el.textContent = '';
  let i = 0;
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (/^\s+$/.test(word)) {
      el.append(' ');
      continue;
    }
    const wordEl = document.createElement('span');
    wordEl.style.display = 'inline-block';
    wordEl.style.whiteSpace = 'nowrap';
    for (const ch of word) {
      const mask = document.createElement('span');
      mask.className = 'rv-mask';
      mask.setAttribute('aria-hidden', 'true');
      const ink = document.createElement('span');
      ink.className = 'rv-ink';
      ink.style.setProperty('--i', String(i++));
      ink.textContent = ch;
      mask.append(ink);
      wordEl.append(mask);
    }
    el.append(wordEl);
  }
}

export function split(el: HTMLElement) {
  const mode = el.dataset.reveal;
  if (mode === 'lines') splitLines(el);
  else if ((mode === 'chars' || mode === 'title') && !el.classList.contains(SPLIT)) splitChars(el);
  el.classList.add(SPLIT);
}

const needsSplit = (el: HTMLElement) => el.dataset.reveal === 'lines' || el.dataset.reveal === 'chars' || el.dataset.reveal === 'title';

export function initReveal(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
  if (reduceMotion) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  els.forEach((el) => el.dataset.delay && el.style.setProperty('--reveal-delay', `${el.dataset.delay}s`));

  // 1. split shortly before an element can be seen (once the fonts are in, so the lines are the real ones)
  const fontsReady = document.fonts.ready;
  const splitter = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        splitter.unobserve(e.target);
        fontsReady.then(() => split(e.target as HTMLElement));
      }
    },
    { rootMargin: '60% 0px 60% 0px' },
  );
  // 2. reveal when it actually enters
  const revealer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        revealer.unobserve(el);
        if (!needsSplit(el)) {
          el.classList.add('is-in');
          continue;
        }
        fontsReady.then(() => {
          if (!el.classList.contains(SPLIT)) split(el);
          requestAnimationFrame(() => el.classList.add('is-in'));
        });
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
  );
  els.forEach((el) => {
    if (needsSplit(el)) splitter.observe(el);
    revealer.observe(el);
  });

  // re-measure split lines after a real width change (rotation, window resize)
  let width = window.innerWidth;
  let timer = 0;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - width) < 40) return;
    width = window.innerWidth;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      els.filter((el) => el.dataset.reveal === 'lines' && el.classList.contains(SPLIT)).forEach(splitLines);
    }, 200);
  });
}
