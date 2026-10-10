// The showroom of each studio chapter (components/Showroom.astro): real things the studio made for its clients, in 3D
// (public/showroom/<id>.glb, made by tools/scenes/remake/products.mjs from the work's own photographs), presented the
// way Agrumea's site (agua) presents its jars: the name very large, the thing in front of it, a bar to go from one to
// the next. Each one's photograph is shown beside it: the model is that thing.
import type { Restricted } from './policy';

export interface Product {
  /** the model: public/showroom/<id>.glb */
  id: string;
  /** the name, in two lines (very large) */
  name: [string, string];
  /** short, for the bar */
  short: string;
  client: string;
  /** what it is and how it was made */
  what: string;
  /** the real one (a picture of the work, src/content/media) */
  photo: string;
  /** the stage's colour, and the name's */
  bg: string;
  ink: string;
  /** how the model sits: its turn at rest (radians), its tilt, how big on the stage (1 = normal) */
  yaw?: number;
  tilt?: number;
  size?: number;
  /** a heading of content/policy.ts it falls under (hidden with it) */
  restricted?: Restricted;
}

export interface Collection {
  label: string;
  title: string;
  /** what the "make yours" opens (the chapter's studio) */
  studio: 'tee' | 'rain' | 'box';
  products: Product[];
}

export const collections: Record<string, Collection> = {
  uniform: {
    label: 'The uniform collection',
    title: 'Worn by real teams',
    studio: 'tee',
    products: [
      {
        id: 'mpg-polo',
        name: ['Barista', 'polo'],
        short: 'MPG polo',
        client: 'Misr Pyramids Group',
        what: 'Black piqué, the logo embroidered on the chest and printed across the back',
        photo: 'mpg-barista',
        bg: '#d9d4c7',
        ink: '#1c1c1c',
        yaw: -0.35,
      },
      {
        id: 'total-polo',
        name: ['Energy', 'polo'],
        short: 'TotalEnergies',
        client: 'TotalEnergies',
        what: 'Royal blue, the brand’s colour wave down the side, the logo embroidered on the chest',
        photo: 'total-polos',
        bg: '#d3dcec',
        ink: '#1f4fc1',
        yaw: 0.35,
      },
      {
        id: 'orange-sweat',
        name: ['Orange', 'crew'],
        short: 'Orange',
        client: 'Orange',
        what: 'A semi-formal sweatshirt in the brand’s orange, the name printed in white',
        photo: 'orange-guy',
        bg: '#f2dcc6',
        ink: '#e45f00',
        yaw: -0.3,
        size: 1.1,
      },
      {
        id: 'raphael-tee',
        name: ['Studio', 'tee'],
        short: 'Raphael tee',
        client: 'Raphael Studios',
        what: 'Our own: heavy cotton, a woven label at the neck',
        photo: 'neck-labels',
        bg: '#ecd6d2',
        ink: '#9e3328',
        yaw: 2.6,
      },
    ],
  },
  giveaways: {
    label: 'The giveaways collection',
    title: 'Kept, used and seen',
    studio: 'rain',
    products: [
      {
        id: 'star-duffle',
        name: ['Star', 'duffle'],
        short: 'Star duffle',
        client: 'A summer campaign',
        what: 'Navy canvas, a yellow end panel with a white star, yellow handles stitched down the front',
        photo: 'duffle-star',
        bg: '#d6dbe6',
        ink: '#22305a',
        yaw: -0.5,
        tilt: 0.12,
        size: 1.15,
      },
      {
        id: 'star-waistbag',
        name: ['Star', 'waist bag'],
        short: 'Waist bag',
        client: 'A summer campaign',
        what: 'Yellow, a big blue star, a black webbing belt and buckle',
        photo: 'star-waistbag',
        bg: '#f1e4b8',
        ink: '#1f4fb5',
        yaw: -0.3,
        tilt: 0.18,
        size: 1.05,
      },
      {
        id: 'sunny-cooler',
        name: ['Sunny', 'cooler'],
        short: 'Cooler',
        client: 'Welcome to the Sunny Side',
        what: 'A soft white cooler, printed in red, a turquoise handle, striped piping',
        photo: 'sunny-cooler',
        bg: '#f4e2c8',
        ink: '#d42a2c',
        yaw: -0.45,
        tilt: 0.12,
      },
      {
        id: 'trevi-blanket',
        name: ['Trevi', 'blanket'],
        short: 'Blanket',
        client: 'Castello di Trevi',
        what: 'A white fleece rolled in a black leather strap, the name embroidered along it',
        photo: 'trevi-blanket',
        bg: '#e3e3e0',
        ink: '#1d1d1d',
        yaw: 0.3,
        tilt: 0.22,
      },
    ],
  },
  packaging: {
    label: 'The packaging collection',
    title: 'Opened in real hands',
    studio: 'box',
    products: [
      {
        id: 'raphael-bag',
        name: ['Raphael', 'bag'],
        short: 'Our bag',
        client: 'Raphael Studios',
        what: 'Red paper, our name in white, and on its front a pair of doors that open onto a tailor’s shop',
        photo: 'raphael-bag',
        bg: '#ecd5d0',
        ink: '#7e1d18',
        yaw: -0.22,
        tilt: 0.05,
      },
      {
        id: 'rivoli-box',
        name: ['Rivoli', 'gift box'],
        short: 'Rivoli',
        client: 'Rivoli',
        what: 'Purple board, an envelope front, the wordmark in gold foil, roses at its corners',
        photo: 'packaging-stack',
        bg: '#ddd3e6',
        ink: '#4b2a6b',
        yaw: -0.5,
        tilt: 0.35,
      },
      {
        id: 'oxi-box',
        name: ['Oxi', 'gift box'],
        short: 'Oxi',
        client: 'Oxi',
        what: 'White board printed with deep-pink carnations and the logo, its lid thrown back on the product',
        photo: 'packaging-stack',
        bg: '#f2dce6',
        ink: '#a3125a',
        yaw: -0.42,
        tilt: 0.32,
      },
      {
        id: 'concentrix-box',
        name: ['Concentrix', 'gift set'],
        short: 'Concentrix',
        client: 'Concentrix',
        what: 'A cream box, the brand’s banner inside its lid, a cork card holder, two pens and a key ring set in black foam',
        photo: 'ev-gift-box',
        bg: '#dde3ef',
        ink: '#13235b',
        yaw: -0.3,
        tilt: 0.5,
      },
    ],
  },
};
