// The atelier module: starts the shirt when it comes near, and runs its inspector in three steps:
//   1 the garment: a T-shirt, a polo or a sweatshirt, its fabric, its colour (any colour: the brand's own);
//   2 the design: a mark on each of four places (left chest, front, back, sleeve), each its own words or logo, font,
//     technique, colour, size and height, the shirt turning to show the place being designed;
//   3 the order: how many of each size, the spec written out as it changes, sent to the studio on WhatsApp, or saved
//     as a spec sheet (the shirt from the front and from the back, and every choice).
// Where the 3D cannot run, the photograph stays and the inspector still writes the spec and the request.
import { onTick } from '../core/ticker';
import { finePointer, gpuTier } from '../core/env';
import { whatsapp } from '../core/whatsapp';
import { cutOut } from '../core/logo';
import { SPOTS, type Design, type Font, type Mark, type Placement, type Technique } from '../tee/print';
import type { Garment, TeeView } from '../tee/view';

const PLACES: Record<Placement, { name: string; turn: number }> = {
  chest: { name: 'Left chest', turn: 0 },
  center: { name: 'Front', turn: 0 },
  back: { name: 'Back', turn: Math.PI },
  sleeve: { name: 'Left sleeve', turn: -0.8 },
};
const ORDER: Placement[] = ['chest', 'center', 'back', 'sleeve'];
const GARMENTS: Record<Garment, { name: string; cloth: string }> = {
  tee: { name: 'T-shirt', cloth: 'jersey-220' },
  polo: { name: 'Polo', cloth: 'pique-220' },
  sweat: { name: 'Sweatshirt', cloth: 'fleece-300' },
};
const FONT_NAMES: Record<Font, string> = { classic: 'the classic serif', bold: 'a bold sans', script: 'a script' };
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const cm = (m: number) => `${(m * 100).toFixed(1).replace(/\.0$/, '')} cm`;

export default async function tee(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('.tee__canvas');
  const form = root.querySelector<HTMLFormElement>('[data-tee-form]');
  if (!canvas || !form) return;
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const radios = (name: string) => form.elements.namedItem(name) as RadioNodeList;
  const nameOf = (group: string, value: string) => $<HTMLInputElement>(`input[name="${group}"][value="${value}"]`)?.closest('label')?.title ?? value.toUpperCase();

  // ---- what is being made
  const mark = (on: boolean, d: Partial<Mark> = {}): Mark => ({ on, text: 'Raphael Studios', logo: null, font: 'classic', ink: '#0c6e66', technique: 'embroidery', size: 1, lift: 0, ...d });
  const design: Design = { colour: '#f4f1ea', marks: { chest: mark(true), center: mark(false), back: mark(false, { technique: 'print' }), sleeve: mark(false) } };
  let garment: Garment = 'tee';
  let place: Placement = 'chest';
  const logoNames: Partial<Record<Placement, string>> = {};

  // ---- the 3D, where it can run
  let view: TeeView | null = null;
  if (gpuTier() > 0) {
    const { TeeView } = await import('../tee/view');
    const v = new TeeView({ canvas, quality: gpuTier() === 2 ? 'hi' : 'lo', onReady: () => root.classList.add('is-ready') });
    try {
      await v.init();
      view = v;
    } catch (err) {
      console.info('[atelier] 3D unavailable, the photo stays', err);
    }
  }
  if (import.meta.env.DEV) (root as HTMLElement & { __view?: unknown }).__view = view;
  if (view) {
    const v = view;
    new ResizeObserver(() => v.resize()).observe(canvas);
    onTick((_, dt) => v.frame(dt));
    v.setDesign(design);
    v.onHover = (on) => canvas.setAttribute('data-cursor', on ? 'Pull' : 'Turn');
    // what a drag does: turn the shirt (the default) or pull its fabric; and the sides at a click
    const hint = $('[data-tee-hint]');
    const modes = $$<HTMLButtonElement>('[data-tee-mode]');
    const setMode = (m: 'turn' | 'pull') => {
      v.setMode(m);
      for (const b of modes) b.setAttribute('aria-checked', String(b.dataset.teeMode === m));
      canvas.setAttribute('data-cursor', m === 'pull' ? 'Pull' : 'Turn');
      if (hint) hint.textContent = m === 'pull' ? (finePointer ? 'Drag the fabric to pull it' : 'Pull the fabric with a finger') : finePointer ? 'Drag to turn it' : 'Swipe to turn it';
    };
    for (const b of modes) b.addEventListener('click', () => setMode(b.dataset.teeMode as 'turn' | 'pull'));
    for (const b of $$<HTMLButtonElement>('[data-tee-view]')) b.addEventListener('click', () => v.turnTo(Number(b.dataset.teeView)));
    $('[data-tee-blow]')?.addEventListener('click', () => v.blow());
    canvas.addEventListener('dblclick', () => v.blow());
    setMode('turn');
  }
  const redraw = (animate = false) => view?.setDesign({ marks: design.marks }, animate, design.marks[place].technique);

  // ---- the steps
  const tabs = $$<HTMLButtonElement>('[data-tee-step]');
  const panes = $$('[data-tee-pane]');
  const goStep = (n: string, focus = false) => {
    for (const t of tabs) {
      const on = t.dataset.teeStep === n;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (const p of panes) p.hidden = p.dataset.teePane !== n;
    if (n === '1') view?.turnTo(0);
    if (n === '2') view?.turnTo(PLACES[place].turn);
  };
  for (const t of tabs) t.addEventListener('click', () => goStep(t.dataset.teeStep!));
  $('.tee__steps')?.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    goStep(tabs[(i + (k === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.teeStep!, true);
  });
  for (const b of $$<HTMLButtonElement>('[data-tee-goto]')) b.addEventListener('click', () => goStep(b.dataset.teeGoto!, true));

  // ---- the editor of the place chosen
  const markBox = $('[data-tee-mark]');
  const logoRow = $('[data-tee-logo]');
  const orig = $('[data-tee-orig]');
  const paintAny = (group: string, hex: string | null) => {
    const sw = $<HTMLInputElement>(`input[name="${group}"][value="any"]`)?.closest('label');
    sw?.classList.toggle('is-picked', !!hex);
    if (hex) sw?.style.setProperty('--c', hex);
  };
  const presetInks = $$<HTMLInputElement>('input[name="ink"]').map((i) => i.value);
  const inkName = (m: Mark) => (m.ink === 'original' ? 'its own colours' : presetInks.includes(m.ink) ? nameOf('ink', m.ink) : m.ink.toUpperCase());
  const outputs = () => {
    const m = design.marks[place];
    const size = $('[data-tee-out="size"]');
    const lift = $('[data-tee-out="lift"]');
    if (size) size.textContent = cm(SPOTS[place].w * m.size);
    if (lift) lift.textContent = m.lift ? `${m.lift > 0 ? '+' : '−'}${cm(Math.abs(m.lift))}` : 'as usual';
    const inkLabel = $('[data-tee-inklabel]');
    if (inkLabel) inkLabel.textContent = m.technique === 'embroidery' ? 'Thread' : 'Ink';
    const named = $('[data-tee-named="ink"]');
    if (named) named.textContent = m.ink === 'original' ? 'The logo’s own' : inkName(m);
    for (const p of ORDER) $(`[data-tee-dot="${p}"]`)?.classList.toggle('is-on', design.marks[p].on);
  };
  const loadMark = () => {
    const m = design.marks[place];
    input('on').checked = m.on;
    input('text').value = m.text;
    radios('font').value = m.font;
    radios('technique').value = m.technique;
    const preset = presetInks.includes(m.ink);
    radios('ink').value = preset ? m.ink : 'any';
    if (!preset) {
      input('inkAny').value = m.ink;
      paintAny('ink', m.ink);
    }
    input('size').value = String(m.size);
    input('lift').value = String(m.lift);
    markBox?.classList.toggle('is-off', !m.on);
    if (logoRow) logoRow.hidden = !m.logo;
    const ln = $('[data-tee-logo-name]');
    if (ln) ln.textContent = logoNames[place] ?? 'Your logo';
    if (orig) orig.hidden = !m.logo;
    outputs();
  };

  // ---- the order
  const total = () => SIZES.reduce((n, s) => n + Math.max(0, Math.floor(Number(input(`q-${s}`)?.value) || 0)), 0);
  const fabricName = () => {
    const v = radios('fabric').value;
    return v === 'any' ? design.colour.toUpperCase() : nameOf('fabric', v);
  };
  const clothName = () => {
    const s = form.elements.namedItem('cloth') as HTMLSelectElement;
    return s.selectedOptions[0]?.textContent ?? '';
  };
  const spec = (): [string, string][] => {
    const lines: [string, string][] = [[GARMENTS[garment].name, `${clothName()}, ${fabricName()}`]];
    for (const p of ORDER) {
      const m = design.marks[p];
      if (!m.on) continue;
      const what = m.logo ? 'our logo' : `“${m.text.trim() || 'Your brand'}” in ${FONT_NAMES[m.font]}`;
      const how = m.technique === 'embroidery' ? 'embroidered' : 'screen printed';
      const height = m.lift ? `, ${cm(Math.abs(m.lift))} ${m.lift > 0 ? 'higher' : 'lower'}` : '';
      lines.push([PLACES[p].name, `${what}, ${how} in ${inkName(m)}, ${cm(SPOTS[p].w * m.size)} wide${height}`]);
    }
    if (lines.length === 1) lines.push(['Marks', 'none: plain']);
    const per = SIZES.map((s) => [s, Math.max(0, Math.floor(Number(input(`q-${s}`)?.value) || 0))] as const).filter(([, n]) => n > 0);
    lines.push(['Quantity', `${total()} pieces${per.length ? `: ${per.map(([s, n]) => `${s} ${n}`).join(', ')}` : ''}`]);
    return lines;
  };
  const writeSpec = () => {
    const t = $('[data-tee-total]');
    if (t) t.textContent = String(total());
    const list = $('[data-tee-spec]');
    if (list) {
      list.replaceChildren(
        ...spec().map(([k, v]) => {
          const li = document.createElement('li');
          const b = document.createElement('b');
          b.textContent = `${k}: `;
          li.append(b, v);
          return li;
        }),
      );
    }
    const order = $<HTMLAnchorElement>('[data-tee-order]');
    if (order) order.href = whatsapp(`Hello Raphael Studios, we would like a sample and a quote:\n${spec().map(([k, v]) => `• ${k}: ${v}`).join('\n')}`);
  };

  // ---- the controls
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const m = design.marks[place];
    switch (t.name) {
      case 'garment':
        garment = t.value as Garment;
        (form.elements.namedItem('cloth') as HTMLSelectElement).value = GARMENTS[garment].cloth;
        void view?.setGarment(garment);
        break;
      case 'fabric':
      case 'fabricAny': {
        if (t.name === 'fabricAny') radios('fabric').value = 'any';
        const any = radios('fabric').value === 'any';
        design.colour = any ? input('fabricAny').value : t.value;
        paintAny('fabric', any ? design.colour : null);
        const named = $('[data-tee-named="fabric"]');
        if (named) named.textContent = fabricName();
        view?.setDesign({ colour: design.colour });
        break;
      }
      case 'place':
        place = t.value as Placement;
        loadMark();
        view?.turnTo(PLACES[place].turn);
        break;
      case 'on':
        m.on = t.checked;
        markBox?.classList.toggle('is-off', !m.on);
        redraw(m.on);
        break;
      case 'text':
        m.text = t.value;
        // (words typed mean the words: a logo there gives way to them)
        if (m.logo) {
          m.logo = null;
          if (m.ink === 'original') m.ink = presetInks[0];
          loadMark();
        }
        redraw();
        break;
      case 'font':
        m.font = t.value as Font;
        redraw();
        break;
      case 'technique':
        m.technique = t.value as Technique;
        redraw(true);
        break;
      case 'ink':
      case 'inkAny':
        if (t.name === 'inkAny') radios('ink').value = 'any';
        m.ink = radios('ink').value === 'any' ? input('inkAny').value : t.value;
        paintAny('ink', radios('ink').value === 'any' ? m.ink : null);
        redraw();
        break;
      case 'size':
        m.size = Number(t.value);
        redraw();
        break;
      case 'lift':
        m.lift = Number(t.value);
        redraw();
        break;
    }
    outputs();
    writeSpec();
  });
  // a logo: its own picture, its plain background taken away (a JPEG's white box would print as a box)
  input('logo')?.addEventListener('change', async (e) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    try {
      const m = design.marks[place];
      m.logo = await cutOut(file);
      m.on = true;
      logoNames[place] = file.name;
      loadMark();
      redraw(true);
      writeSpec();
    } catch {
      /* not a picture we can read: the words stay */
    }
    el.value = '';
  });
  $('[data-tee-logo-clear]')?.addEventListener('click', () => {
    const m = design.marks[place];
    m.logo = null;
    if (m.ink === 'original') m.ink = presetInks[0];
    loadMark();
    redraw();
    writeSpec();
  });
  $('[data-tee-make]')?.addEventListener('click', () => view?.make(design.marks[place].technique));
  $('[data-tee-sheet]')?.addEventListener('click', () => sheet(view, spec()));
  loadMark();
  writeSpec();
}

/** the spec sheet: the shirt from the front and the back, and every choice; saved as a picture */
function sheet(view: TeeView | null, lines: [string, string][]) {
  const W = 1600, H = 1000;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f5ef';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#0c6e66';
  g.fillRect(0, 0, W, 10);
  g.fillStyle = '#1d1d18';
  g.font = '700 46px Philosopher, Georgia, serif';
  g.fillText('Raphael Studios · Atelier', 64, 100);
  g.fillStyle = '#6a685e';
  g.font = '400 22px system-ui, -apple-system, Segoe UI, sans-serif';
  g.fillText(`Spec sheet · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 64, 138);
  // the two sides
  const shots = view?.views() ?? [];
  ['Front', 'Back'].forEach((label, i) => {
    const x = 64 + i * 452, y = 176, w = 432, h = 620;
    g.fillStyle = '#ece8de';
    g.beginPath();
    g.roundRect(x, y, w, h, 22);
    g.fill();
    const s = shots[i];
    if (s) {
      // the shirt, centred and fitted to the panel's height
      const k = Math.max(w / s.width, h / s.height);
      const sw = w / k, sh = h / k;
      g.save();
      g.beginPath();
      g.roundRect(x, y, w, h, 22);
      g.clip();
      g.drawImage(s, (s.width - sw) / 2, (s.height - sh) / 2, sw, sh, x, y, w, h);
      g.restore();
    }
    g.fillStyle = '#6a685e';
    g.font = '700 18px system-ui, -apple-system, Segoe UI, sans-serif';
    g.fillText(label.toUpperCase(), x + 20, y + h + 34);
  });
  // the choices
  let y = 200;
  const x0 = 1000, maxW = 540;
  for (const [k, v] of lines) {
    g.fillStyle = '#6a685e';
    g.font = '700 17px system-ui, -apple-system, Segoe UI, sans-serif';
    g.fillText(k.toUpperCase(), x0, y);
    y += 30;
    g.fillStyle = '#1d1d18';
    g.font = '400 25px Georgia, serif';
    let line = '';
    for (const word of v.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > maxW && line) {
        g.fillText(line, x0, y);
        y += 34;
        line = word;
      } else line = test;
    }
    g.fillText(line, x0, y);
    y += 50;
  }
  g.fillStyle = '#6a685e';
  g.font = '400 19px system-ui, -apple-system, Segoe UI, sans-serif';
  g.fillText('A request for a sample: the studio confirms the colours, the sizes and the price before anything is made.', 64, H - 56);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = 'raphael-atelier-spec.png';
  document.body.append(a);
  a.click();
  a.remove();
}
