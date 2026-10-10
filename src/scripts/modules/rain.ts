// The giveaways studio: starts the sand when it comes near, lets the first rain fall when it is in view, wires the
// brand (its name, or its logo in the brand's colour or its own), the colour (any), the set (the kinds kept: only
// those fall), how many sets, the shake and the "more", and writes the request.
import { onTick } from '../core/ticker';
import { finePointer, gpuTier } from '../core/env';
import { whatsapp } from '../core/whatsapp';
import { cutOut } from '../core/logo';

export default async function rain(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('.studio__canvas');
  const form = root.querySelector<HTMLFormElement>('[data-rain-form]');
  if (!canvas || !form) return;
  const caption = root.querySelector<HTMLElement>('[data-rain-caption]');
  const hint = root.querySelector<HTMLElement>('[data-rain-hint]');
  if (hint && !finePointer) hint.textContent = 'Touch one and throw it';
  // the sand, where the 3D can run (else the photo stays, and the form still writes the request)
  const start = async () => {
    const { RainView } = await import('../rain/view');
    const v = new RainView({ canvas, quality: gpuTier() === 2 ? 'hi' : 'lo', onReady: () => root.classList.add('is-ready') });
    try {
      await v.init();
      return v;
    } catch (err) {
      console.info('[giveaways] 3D unavailable, the photo stays', err);
      return null;
    }
  };
  const view = gpuTier() > 0 ? await start() : null;
  if (view) {
    if (import.meta.env.DEV) (root as HTMLElement & { __view?: unknown }).__view = view;
    new ResizeObserver(() => view.resize()).observe(canvas);
    onTick((_, dt) => view.frame(dt));
    view.onHover = (on) => canvas.setAttribute('data-cursor', on ? 'Throw' : 'Turn');
    // the first rain, once the sand is well in view
    const io = new IntersectionObserver(
      (es) => {
        if (!es[es.length - 1].isIntersecting) return;
        io.disconnect();
        view.rain(18);
      },
      { threshold: 0.5 },
    );
    io.observe(canvas);
    root.querySelector('[data-rain-shake]')?.addEventListener('click', () => view.shake());
    root.querySelector('[data-rain-more]')?.addEventListener('click', () => {
      view.rain(6);
      if (caption) caption.textContent = 'Six more for the pile';
    });
  }

  const val = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLInputElement | null)?.value ?? '';
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const brand: { logo: ImageBitmap | null; own: boolean } = { logo: null, own: false };
  const colour = () => (val('colour') === 'any' ? input('colourAny').value : val('colour'));
  const colourName = () =>
    val('colour') === 'any' ? colour().toUpperCase() : (form.querySelector<HTMLInputElement>('input[name="colour"]:checked')?.closest('label')?.title ?? colour());
  const kept = () => [...form.querySelectorAll<HTMLInputElement>('input[name="kind"]:checked')];
  const logoRow = root.querySelector<HTMLElement>('[data-rain-logo]');
  const order = root.querySelector<HTMLAnchorElement>('[data-rain-order]');
  const updateOrder = () => {
    if (!order) return;
    const name = val('text').trim();
    const things = kept().map((k) => k.closest('label')?.textContent?.trim().toLowerCase() ?? k.value);
    const sets = Math.max(0, Math.floor(Number(val('sets')) || 0));
    const mark = brand.logo ? `our logo ${brand.own ? 'in its own colours' : `in ${colourName()}`}` : `our name in ${colourName()}`;
    const msg = `Hello Raphael Studios, we would like ${sets} sets of branded giveaways${name ? ` for ${name}` : ''}: ${things.length ? things.join(', ') : 'to be chosen'}. On each, ${mark}.`;
    order.href = whatsapp(msg);
  };
  const paintAny = () => {
    const sw = form.querySelector<HTMLInputElement>('input[name="colour"][value="any"]')?.closest('label');
    sw?.classList.toggle('is-picked', val('colour') === 'any');
    sw?.style.setProperty('--c', input('colourAny').value);
  };
  const apply = () => view?.setBrand({ name: val('text'), colour: colour(), logo: brand.logo, own: brand.own });
  let raf = 0;
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'logo') return;
    if (t.name === 'colourAny') (form.elements.namedItem('colour') as RadioNodeList).value = 'any';
    if (t.name === 'own') brand.own = t.checked;
    if (t.name === 'kind') {
      view?.keep(kept().map((k) => k.value));
      // a kind put back in comes down at once
      if (t.checked) view?.rain(3);
    }
    paintAny();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      apply();
      updateOrder();
    });
  });
  input('logo')?.addEventListener('change', async (e) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    try {
      brand.logo = await cutOut(file);
      if (logoRow) logoRow.hidden = false;
      const n = root.querySelector('[data-rain-logo-name]');
      if (n) n.textContent = file.name;
      apply();
      updateOrder();
      if (caption) caption.textContent = 'Your logo on everything';
    } catch {
      /* not a picture we can read: the name stays */
    }
    el.value = '';
  });
  root.querySelector('[data-rain-logo-clear]')?.addEventListener('click', () => {
    brand.logo = null;
    if (logoRow) logoRow.hidden = true;
    apply();
    updateOrder();
  });
  updateOrder();
}
