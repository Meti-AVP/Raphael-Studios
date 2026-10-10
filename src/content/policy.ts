// What the public site may show. Some of the studio's work is for brands whose advertising the law restricts, or
// shows a celebrity: confirm each with the client (and a lawyer) before publishing, and list here what to leave out.
// Hidden work disappears everywhere at build time: from the statements, the galleries, the exhibits and the captions.
//
//   hide: ['tobacco']                      no IQOS work (the 3D chapter then shows only the kiosk)
//   hide: ['tobacco', 'alcohol', 'talent'] the most careful setting
export type Restricted = 'tobacco' | 'alcohol' | 'talent';

export const hide: Restricted[] = [];

/** the work that falls under each heading */
export const restricted: Record<string, Restricted> = {
  // IQOS (heated tobacco) and its North Coast Summer Remix event
  'iqos-neon': 'tobacco',
  'iqos-wall': 'tobacco',
  'iqos-totes': 'tobacco',
  'iqos-bag': 'tobacco',
  'iqos-towels': 'tobacco',
  'iqos-crossbody': 'tobacco',
  'iqos-ornament': 'tobacco',
  'iqos-pouch': 'tobacco',
  'iqos-market': 'tobacco',
  'iqos-duffle': 'tobacco',
  'viz-cafes': 'tobacco',
  'viz-clocks': 'tobacco',
  'viz-night-wall': 'tobacco',
  'viz-plant-stand': 'tobacco',
  'viz-totems': 'tobacco',
  'viz-wood-sign': 'tobacco',
  'remix-dj': 'tobacco',
  'remix-booth': 'tobacco',
  'remix-stage': 'tobacco',
  'remix-entrance': 'tobacco',
  'remix-vending': 'tobacco',
  'remix-entertainment': 'tobacco',
  // beer brands and a drinks retailer
  'heineken-cooler': 'alcohol',
  'heineken-duo': 'alcohol',
  'heineken-2025': 'alcohol',
  'heineken-bag': 'alcohol',
  'sol-cooler': 'alcohol',
  'sol-tee': 'alcohol',
  'sol-hat': 'alcohol',
  'drinkies-tote': 'alcohol',
  // a campaign with an actress
  'oxi-donia': 'talent',
};

/** the brands on the wall that fall under each heading */
export const restrictedBrands: Record<string, Restricted> = {
  'Philip Morris International': 'tobacco',
  IQOS: 'tobacco',
  Heineken: 'alcohol',
  'Al Ahram Beverages': 'alcohol',
};

/** may this picture be shown */
export const visible = (id: string) => !hide.includes(restricted[id] as Restricted);

/** may this brand's logo be shown */
export const visibleBrand = (name: string) => !hide.includes(restrictedBrands[name] as Restricted);
