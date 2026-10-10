// The packaging studio: starts the box when it comes near, folds it the first time it is seen, wires the controls
// (the finish, the brand's name or logo, the size, how many, what goes with it), and writes the sample request. Where
// the 3D cannot run, the photo of real boxes stays and the form still writes the request.
import { onTick } from '../core/ticker';
import { finePointer, gpuTier } from '../core/env';
import type { BoxState, BoxView } from '../box/view';
import { whatsapp } from '../core/whatsapp';

const CAPTIONS: Record<BoxState, string> = {
  flat: 'The die-cut sheet',
  folding: 'Folding…',
  unfolding: 'Opening out…',
  closed: 'Mailer box',
  open: 'Open it like a present',
};

export default async function box(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('.studio__canvas');
  const form = root.querySelector<HTMLFormElement>('[data-box-form]');
  if (!canvas || !form) return;
  const foldBtn = root.querySelector<HTMLButtonElement>('[data-box-fold]')!;
  const lidBtn = root.querySelector<HTMLButtonElement>('[data-box-lid]')!;
  const caption = root.querySelector<HTMLElement>('[data-box-caption]');
  const hint = root.querySelector<HTMLElement>('[data-box-hint]');
  const val = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLInputElement | null)?.value ?? '';
  const { FINISHES, logoMask } = await import('../box/print');

  // ---- the box, where the 3D can run
  let view: BoxView | null = null;
  if (gpuTier() > 0) {
    const { BoxView } = await import('../box/view');
    const v = new BoxView({
      canvas,
      quality: gpuTier() === 2 ? 'hi' : 'lo',
      onReady: () => root.classList.add('is-ready'),
      onState: (s) => {
        if (caption) caption.textContent = s === 'closed' ? `${CAPTIONS[s]} · ${val('size')}` : CAPTIONS[s];
        const built = s === 'closed' || s === 'open';
        foldBtn.textContent = s === 'flat' || s === 'unfolding' ? 'Fold it' : 'Lay it flat';
        lidBtn.disabled = !built;
        lidBtn.textContent = s === 'open' ? 'Close the lid' : 'Open the lid';
        // on a phone a swipe up or down scrolls the page: the lid opens with a tap there
        if (hint)
          hint.textContent = finePointer
            ? built
              ? 'Drag the lid to open it · drag around to turn'
              : 'Click the sheet to fold it · drag around to turn'
            : built
              ? 'Tap the lid to open it · swipe sideways to turn'
              : 'Tap the sheet to fold it · swipe sideways to turn';
      },
    });
    try {
      await v.init();
      view = v;
    } catch (err) {
      console.info('[packaging] 3D unavailable, the photo stays', err);
    }
  }
  if (view) {
    const v = view;
    if (import.meta.env.DEV) (root as HTMLElement & { __view?: unknown }).__view = v;
    new ResizeObserver(() => v.resize()).observe(canvas);
    onTick((_, dt) => v.frame(dt));
    v.onHover = (on) => canvas.setAttribute('data-cursor', on === 'lid' ? (v.isOpen ? 'Close' : 'Open') : on === 'box' && !v.folded ? 'Fold' : 'Turn');
    // the first time the box is well in view, the sheet folds itself
    const io = new IntersectionObserver(
      (es) => {
        if (!es[es.length - 1].isIntersecting) return;
        io.disconnect();
        setTimeout(() => v.setFolded(true), 500);
      },
      { threshold: 0.6 },
    );
    io.observe(canvas);
    foldBtn.addEventListener('click', () => v.setFolded(!v.folded));
    lidBtn.addEventListener('click', () => v.toggleLid());
  }

  // ---- the controls
  const chosen = root.querySelector<HTMLElement>('[data-box-finish]');
  let logo: HTMLCanvasElement | null = null;
  let raf = 0;
  const apply = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const finish = val('finish') as keyof typeof FINISHES;
      if (chosen) chosen.textContent = FINISHES[finish].name;
      view?.setDesign({ finish, text: val('text'), logo });
      updateOrder();
    });
  };
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'logo') return;
    if (t.name === 'size' && caption && view?.folded && !view.isOpen) caption.textContent = `${CAPTIONS.closed} · ${val('size')}`;
    apply();
  });
  form.querySelector<HTMLInputElement>('input[name="logo"]')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      logo = await logoMask(file);
    } catch {
      logo = null;
    }
    apply();
  });

  const order = root.querySelector<HTMLAnchorElement>('[data-box-order]');
  const updateOrder = () => {
    if (!order) return;
    const f = FINISHES[val('finish') as keyof typeof FINISHES];
    const text = val('text').trim();
    const extras = [...form.querySelectorAll<HTMLInputElement>('input[name="extra"]:checked')].map((x) => x.closest('label')?.textContent?.trim().toLowerCase() ?? x.value);
    const boxes = Math.max(0, Math.floor(Number(val('boxes')) || 0));
    const msg = `Hello Raphael Studios, we would like ${boxes} mailer boxes (${val('size')}), a sample first: ${f.name.toLowerCase()}, with ${logo ? 'our logo' : `"${text || 'our brand'}"`} in ${f.technique}${extras.length ? `; with ${extras.join(', ')}` : ''}.`;
    order.href = whatsapp(msg);
  };
  updateOrder();
}
