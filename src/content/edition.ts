// The painted edition: how the company profile (site.ts, from the 2026 PDF) is told on the page.
// One chapter per section of the profile (p6–p21), each opening on its own painted scene (public/scenes/<scene>).
import { chapters as profile, company, services } from './site';
import type { ChapterId } from './site';

export const edition = {
  /** the lockup in the frame, as on the profile's cover */
  title: ['Raphael', 'Studios'] as const,
  script: 'Creative Hub',
  subtitle: `${company.tagline}.`,
  copyright: `© ${company.name} · ${company.city}`,
};

export interface Feature {
  /** the narrative title; its first letter becomes the script initial */
  title: string;
  label: string;
  text: string;
  /** media ids shown with it (first is the main picture) */
  media: string[];
  /** an interactive piece instead of (or over) the pictures */
  interactive?: 'tee' | 'box' | 'billboard' | 'rain' | 'viz' | 'polaroids';
  cta?: { label: string; href: string };
}

export interface EditionChapter {
  id: ChapterId;
  numeral: string;
  /** the index name and the opener's headline */
  name: string;
  /** the full title from the profile */
  full: string;
  /** the line under the headline, over the painting (first letter in script) */
  lead: string;
  /** the chapter's opening statement on the paper: words, and pictures set inside the sentence */
  statement: (string | { m: string })[];
  scene: string;
  features: Feature[];
  /** the rest of the chapter's pictures, as a grid */
  works: string[];
  /** the services of p4 that belong to this chapter */
  services: string[];
}

const p = Object.fromEntries(profile.map((c) => [c.id, c])) as Record<ChapterId, (typeof profile)[number]>;
const svc = (id: ChapterId) => services.flatMap((g) => g.items.filter((s) => s.chapter === id).map((s) => s.name));

export const chapters: EditionChapter[] = [
  {
    id: 'solutions',
    numeral: 'I',
    name: 'Solutions',
    full: 'Customized solutions',
    lead: 'Customized solutions, with uncompromising quality, for the brands that trust us.',
    statement: ['One-off pieces ', { m: 'iqos-neon' }, ', suits ', { m: 'robot-suit' }, ' and stands ', { m: 'oxi-display' }, ', each made for one brand only.'],
    scene: 'solutions',
    features: [
      {
        title: 'Made for one brand only',
        label: 'Customized solutions',
        text: p.solutions.text[0],
        media: ['iqos-neon', 'caf-ball', 'oxi-display'],
      },
      {
        title: 'From a sketch to a suit',
        label: 'High-end customized sampling',
        text: 'A proposal, a 3D-modelled mask and a finished suit: one-off pieces developed with the client until they are right.',
        media: ['robot-suit', 'football-bags'],
      },
    ],
    works: ['iqos-wall', 'football-bags'],
    services: svc('solutions'),
  },
  {
    id: 'gifts',
    numeral: 'II',
    name: 'Gifts',
    full: 'Promotional gifts',
    lead: 'Promotional gifts that strengthen recognition and stay in people’s hands.',
    statement: ['Gifts people keep: totes ', { m: 'bonjour-totes' }, ', colour sets ', { m: 'aura-colors' }, ' and keepsakes ', { m: 'promo-collage' }, ' that carry your name.'],
    scene: 'gifts',
    features: [
      {
        title: 'Gifts people keep',
        label: 'Promotional gifts',
        text: p.gifts.text[0],
        media: ['bonjour-totes', 'aura-colors', 'promo-collage'],
      },
    ],
    works: ['heineken-cooler', 'sol-cooler', 'drinkies-tote'],
    services: svc('gifts'),
  },
  {
    id: 'packaging',
    numeral: 'III',
    name: 'Packaging',
    full: 'Packaging solutions',
    lead: 'Packaging that turns a product into a presentation.',
    statement: ['Boxes ', { m: 'packaging-stack' }, ' that turn a product into a presentation, from the first sample ', { m: 'trevi-box' }, ' to stacked trucks ', { m: 'packaging-mass' }, '.'],
    scene: 'packaging',
    features: [
      {
        title: 'Open it like a present',
        label: 'Packaging solutions',
        text: p.packaging.text[0],
        media: ['packaging-stack', 'trevi-box'],
        interactive: 'box',
      },
      {
        title: 'The same, every time',
        label: 'Packaging in production',
        text: 'Boxes for Oxi and Rivoli, from the first sample to stacked trucks.',
        media: ['packaging-mass', 'raphael-bag'],
      },
    ],
    works: [],
    services: svc('packaging'),
  },
  {
    id: 'uniform',
    numeral: 'IV',
    name: 'Uniform',
    full: 'Corporate uniform',
    lead: 'Uniforms that carry your identity with comfort, durability and pride.',
    statement: ['Uniforms ', { m: 'orange-guy' }, ' that carry your identity with comfort ', { m: 'heineken-duo' }, ', durability and pride ', { m: 'oxi-blazer' }, '.'],
    scene: 'uniform',
    features: [
      {
        title: 'Try it on your brand',
        label: 'The atelier',
        text: 'A real shirt, cut from a pattern and sewn in the browser: pick the fabric colour, put your name or logo on it, and pull it around. This is the sample we would make.',
        media: ['neck-labels'],
        interactive: 'tee',
      },
      {
        title: 'Worn by whole teams',
        label: 'Corporate uniform',
        text: p.uniform.text.join(' '),
        media: ['orange-guy', 'heineken-duo', 'oxi-blazer', 'orange-girl'],
      },
    ],
    works: ['mpg-barista', 'sol-tee', 'crystal-uniform', 'heineken-2025', 'total-polos', 'rivoli-team', 'rivoli-activation', 'total-team', 'promoters'],
    services: svc('uniform'),
  },
  {
    id: 'production',
    numeral: 'V',
    name: 'Production',
    full: 'Mass production',
    lead: 'Large runs, the same quality on every piece, delivered on time.',
    statement: ['Thousands of caps ', { m: 'embroidery-caps' }, ', labels ', { m: 'neck-labels' }, ' and badges ', { m: 'embroidery-laurel' }, ', every one like the first.'],
    scene: 'production',
    features: [
      {
        title: 'Stitched at scale',
        label: 'Mass production',
        text: p.production.text[0],
        media: ['embroidery-caps', 'embroidery-laurel', 'neck-labels'],
      },
    ],
    works: [],
    services: svc('production'),
  },
  {
    id: 'giveaways',
    numeral: 'VI',
    name: 'Giveaways',
    full: 'Customized giveaways',
    lead: 'Giveaways designed to be kept, used and seen.',
    statement: ['Giveaways designed to be kept ', { m: 'iqos-totes' }, ', used ', { m: 'sol-hat' }, ' and seen ', { m: 'duffle-star' }, '.'],
    scene: 'giveaways',
    features: [
      {
        title: 'Summer, branded',
        label: 'Customized giveaways',
        text: p.giveaways.text[0],
        media: ['iqos-totes', 'sol-hat', 'duffle-star', 'backgammon'],
        interactive: 'rain',
      },
    ],
    works: ['iqos-bag', 'wellwoman', 'iqos-towels', 'clear-bag', 'sunny-cooler', 'heineken-bag', 'iqos-crossbody', 'iqos-ornament', 'ucl-ball', 'star-waistbag', 'trevi-blanket', 'iqos-pouch', 'iqos-market', 'iqos-duffle'],
    services: svc('giveaways'),
  },
  {
    id: 'pos',
    numeral: 'VII',
    name: 'POS',
    full: 'POS materials',
    lead: 'Displays, stands and shelf branding that win the aisle.',
    statement: ['Displays ', { m: 'dosh-pos' }, ', shelf visuals ', { m: 'oxi-donia' }, ' and stands ', { m: 'rivoli-packs' }, ' that win the moment people choose.'],
    scene: 'pos',
    features: [
      {
        title: 'Seen on every shelf',
        label: 'POS materials',
        text: p.pos.text[0],
        media: ['dosh-pos', 'oxi-donia', 'rivoli-packs'],
      },
    ],
    works: [],
    services: svc('pos'),
  },
  {
    id: 'identity',
    numeral: 'VIII',
    name: 'Identity',
    full: 'Corporate identity',
    lead: 'Identities that stay consistent at every touchpoint.',
    statement: ['Marks ', { m: 'doctor-clean' }, ', systems and proposals ', { m: 'identity-proposals' }, ' that make one brand recognisable everywhere.'],
    scene: 'identity',
    features: [
      {
        title: 'One brand, everywhere',
        label: 'Corporate identity',
        text: p.identity.text[0],
        media: ['doctor-clean', 'identity-proposals'],
      },
    ],
    works: [],
    services: svc('identity'),
  },
  {
    id: 'communication',
    numeral: 'IX',
    name: 'Campaigns',
    full: 'Creative design & brand communication',
    lead: 'Concepts, artwork and campaigns that bring brands to life.',
    statement: ['Campaigns that travel, from one idea ', { m: 'total-caf' }, ' to every post ', { m: 'total-social' }, ' and every poster ', { m: 'womens-day' }, '.'],
    scene: 'communication',
    features: [
      {
        title: 'Discover your energy',
        label: 'Creative design & brand communication',
        text: p.communication.text[0],
        media: ['total-social', 'total-caf', 'womens-day'],
      },
    ],
    works: [],
    services: svc('communication'),
  },
  {
    id: 'visualization',
    numeral: 'X',
    name: '3D',
    full: '3D design and visualization',
    lead: 'See it built before anything is made.',
    statement: ['See it drawn ', { m: 'viz-plant-stand' }, ', rendered ', { m: 'viz-night-wall' }, ' and lit ', { m: 'viz-totems' }, ' before anything is made.'],
    scene: 'visualization',
    features: [
      {
        title: 'Drawn, then rendered',
        label: '3D design & visualization',
        text: p.visualization.text[0],
        media: ['viz-night-wall', 'viz-cafes'],
        interactive: 'viz',
      },
    ],
    works: ['viz-plant-stand', 'viz-totems', 'viz-wood-sign', 'viz-clocks'],
    services: svc('visualization'),
  },
  {
    id: 'outdoor',
    numeral: 'XI',
    name: 'Outdoor',
    full: 'Outdoor events',
    lead: 'Outdoor campaigns that stop the street.',
    statement: ['Your name on the street ', { m: 'remix-entrance' }, ', the stage ', { m: 'remix-stage' }, ' and the night ', { m: 'remix-dj' }, '.'],
    scene: 'outdoor',
    features: [
      {
        title: 'Your name on the hill',
        label: 'Outdoor campaigns',
        text: p.outdoor.text[0],
        media: ['remix-dj', 'remix-entrance'],
        interactive: 'billboard',
      },
    ],
    works: ['remix-booth', 'remix-stage', 'remix-vending', 'remix-entertainment'],
    services: svc('outdoor'),
  },
  {
    id: 'events',
    numeral: 'XII',
    name: 'Events',
    full: 'Events & activations',
    lead: 'Activations, team buildings and brand experiences, end to end.',
    statement: ['Activations ', { m: 'superheroes' }, ', team days ', { m: 'ev-team' }, ' and parties ', { m: 'back-to-90s' }, ', produced from end to end.'],
    scene: 'events',
    features: [
      {
        title: 'Everyone takes a picture home',
        label: 'Events & activations',
        text: p.events.text[0],
        media: ['superheroes', 'back-to-90s'],
        interactive: 'polaroids',
      },
    ],
    works: ['ev-facepaint-1', 'ev-facepaint-2', 'ev-photo-card', 'ev-facepaint-3', 'ev-90s-1', 'ev-gift-box', 'ev-cart', 'ev-90s-2', 'ev-team', 'ev-boxes'],
    services: svc('events'),
  },
  {
    id: 'photography',
    numeral: 'XIII',
    name: 'Photography',
    full: 'Photography services',
    lead: 'Products, brands and events, photographed with creative direction.',
    statement: ['Light ', { m: 'total-night' }, ', direction ', { m: 'marie-louis-1' }, ' and a story ', { m: 'riding-jacket' }, ' in every picture.'],
    scene: 'photography',
    features: [
      {
        title: 'Light, direction, a story',
        label: 'Photography services',
        text: p.photography.text[0],
        media: ['total-night', 'marie-louis-1', 'riding-jacket'],
      },
    ],
    works: ['acapella', 'marie-louis-2', 'marie-louis-3', 'winter-street'],
    services: svc('photography'),
  },
];

/** the index groups of the construction lines, per section (hero first) — as in the reference */
export const lineGroups = [7, 6, 6, 5, 4, 3, 2, 1, 8, 7, 6, 5, 4, 3];
