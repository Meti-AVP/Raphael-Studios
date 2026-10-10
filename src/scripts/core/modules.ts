// Section behaviour loads on demand: an element with data-module="name" imports ../modules/name when it comes
// within ~1.5 screens of the viewport. A page only downloads the code of the parts a visitor actually reaches.
type Mount = (el: HTMLElement) => void;
type Loader = () => Promise<{ default: Mount }>;

const loaders: Record<string, Loader> = {
  strip: () => import('../modules/strip'),
  tee: () => import('../modules/tee'),
  billboard: () => import('../modules/billboard'),
  box: () => import('../modules/box'),
  booth: () => import('../modules/booth'),
  viz: () => import('../modules/viz'),
  rain: () => import('../modules/rain'),
  depth: () => import('../modules/depth'),
  gallery: () => import('../modules/gallery'),
  offer: () => import('../modules/offer'),
  tumbler: () => import('../modules/tumbler'),
  shelf: () => import('../modules/shelf'),
  showroom: () => import('../modules/showroom'),
};

export function initModules(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-module]')];
  const mount = (el: HTMLElement) => {
    for (const name of (el.dataset.module || '').split(/\s+/)) {
      const load = loaders[name];
      if (!load) continue;
      load()
        .then((m) => m.default(el))
        .catch((err) => console.error(`[module ${name}]`, err));
    }
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        mount(e.target as HTMLElement);
      }
    },
    { rootMargin: '150% 0px 150% 0px' },
  );
  els.forEach((el) => (el.hasAttribute('data-module-eager') ? mount(el) : io.observe(el)));
}
