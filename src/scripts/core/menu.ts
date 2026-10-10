// The bar's "Chapters" dropdown: opens on click, closes on Escape, outside click or when a chapter is chosen.
export function initMenu() {
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  const toggle = menu?.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const drop = menu?.querySelector<HTMLElement>('.bar__drop');
  if (!menu || !toggle || !drop) return;
  const set = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    drop.hidden = !open;
    if (open) drop.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  drop.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      set(false);
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (toggle.getAttribute('aria-expanded') === 'true' && !menu.contains(e.target as Node)) set(false);
  });
}
