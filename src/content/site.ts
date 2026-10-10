// The site's words. Source: "raphael Studios Story 2026 final.pdf" (the client's 2026 company profile); page numbers
// in comments. Edits are limited to typos and consistent spelling; docs/CONTENT.md lists them.

export const company = {
  name: 'Raphael Studios',
  descriptor: 'Creative Hub',
  city: 'Cairo',
  country: 'Egypt',
  founded: 2011,
  tagline: 'An agency for what comes next', // p2
  promise:
    'We don’t just create products. We build brands, create experiences, and deliver solutions that leave a lasting impression.', // p2, p4
  intro: [
    // p2
    'Raphael Studios Creative Hub is a full-service creative branding and production agency specializing in innovative and customized marketing solutions. Since our establishment in 2011, we have helped businesses transform ideas into impactful brand experiences through creativity, strategic thinking, and premium execution.',
    'We combine creative excellence, manufacturing expertise, and marketing innovation to deliver end-to-end solutions tailored to each client’s unique vision. From concept development to final production, every project is executed with precision, quality, and attention to detail.',
  ],
  approach: [
    // p5
    'At Raphael Studios Creative Hub, we proudly serve the Egyptian, regional, and international markets with a commitment to excellence and client satisfaction. We are more than an advertising and branding agency — we are strategic partners dedicated to creating meaningful business impact. Our approach is built on understanding our clients’ objectives and delivering creative, innovative, and results-driven solutions that help brands grow and stand out.',
    'What truly sets us apart is our belief that people are the foundation of every successful business. We continuously invest in our team, fostering a culture of collaboration, creativity, ownership, and continuous development. We believe that exceptional people create exceptional work. Working as one unified team, we pay close attention to every detail and pursue perfection in every stage of the creative and production process. From concept to execution, we are committed to delivering premium quality with consistency, precision, and passion. Our mission is to provide unique, tailor-made advertising, branding, and production services that exceed expectations.',
    'We strive to build long-term relationships with our clients by delivering outstanding experiences and ensuring the highest level of customer satisfaction.',
  ],
  approachClosing: 'We don’t just create campaigns — we build brands, inspire experiences and bring ideas to life.', // p5
  partners: {
    // p22: "we are strategic partners / dedicated to creating meaningful business impact."
    text: 'dedicated to creating meaningful business impact.',
  },
  contact: {
    // p23
    person: 'Rafik Roushdy',
    role: 'Co-Founder',
    email: 'rafik.roushdy@gmail.com',
    mobile: '+20 122 333 2000',
    mobileHref: 'tel:+201223332000',
    whatsapp: '201223332000',
    office: '+20 2 3762 5180',
    officeHref: 'tel:+20237625180',
    website: 'www.raphael-studios.com',
    address: ['4 Al Youssr St.', 'Dokki, Cairo, Egypt'],
    mapsHref: 'https://www.google.com/maps/search/?api=1&query=4+Al+Youssr+St%2C+Dokki%2C+Giza%2C+Egypt',
  },
} as const;

/** The 22 services, as listed on p4, grouped so a visitor can scan them. */
export const services = [
  {
    group: 'Make',
    note: 'Products made for your brand',
    items: [
      { name: 'Promotional Gifts', chapter: 'gifts' },
      { name: 'Packaging', chapter: 'packaging' },
      { name: 'Giveaways', chapter: 'giveaways' },
      { name: 'Corporate Uniform', chapter: 'uniform' },
      { name: 'High-End Customized Sampling', chapter: 'solutions' },
      { name: 'Mass Production', chapter: 'production' },
      { name: 'POS Materials', chapter: 'pos' },
      { name: 'Events and Trophies', chapter: 'events' },
      { name: 'Fashion Brand', chapter: 'uniform' },
    ],
  },
  {
    group: 'Show',
    note: 'Images that sell',
    items: [
      { name: 'Photography Services', chapter: 'photography' },
      { name: '3D Creative Ideas', chapter: 'visualization' },
    ],
  },
  {
    group: 'Brand',
    note: 'Identities that last',
    items: [
      { name: 'Corporate Identities', chapter: 'identity' },
      { name: 'Corporate Branding', chapter: 'identity' },
      { name: 'Creative Concepts & Art Directions', chapter: 'communication' },
      { name: 'Posters', chapter: 'communication' },
      { name: 'Ads', chapter: 'communication' },
    ],
  },
  {
    group: 'Campaign',
    note: 'Ideas that travel',
    items: [
      { name: 'Full Media Campaigns', chapter: 'communication' },
      { name: 'Social Media Campaigns', chapter: 'communication' },
      { name: 'Full Marketing Campaigns', chapter: 'communication' },
      { name: 'Marketing Plan Proposals', chapter: 'identity' },
      { name: 'Outdoor Campaigns', chapter: 'outdoor' },
      { name: 'Proposals and Presentations', chapter: 'identity' },
    ],
  },
] as const;

export type ChapterId =
  | 'solutions'
  | 'gifts'
  | 'packaging'
  | 'uniform'
  | 'production'
  | 'giveaways'
  | 'pos'
  | 'identity'
  | 'communication'
  | 'visualization'
  | 'outdoor'
  | 'events'
  | 'photography';

export interface Chapter {
  id: ChapterId;
  numeral: string;
  title: [heavy: string, light: string];
  short: string;
  text: string[];
  /** media ids (src/content/media.generated.json) in the order they appear */
  media: string[];
  /** media id shown in the services list on hover */
  preview: string;
  /** how the work is laid out: a draggable strip, people who step out of their photos, or a wall */
  layout: 'slider' | 'people' | 'mosaic';
  /** an interactive piece that opens the chapter */
  feature?: 'packaging' | 'keychain' | 'atelier' | 'viz' | 'polaroids';
}

/** The work, in the order of the company profile (p6–p21). */
export const chapters: Chapter[] = [
  {
    id: 'solutions',
    numeral: 'I',
    title: ['Customized', 'Solutions'],
    short: 'Customized solutions',
    text: [
      'Over the years we have earned the trust of leading local and international brands by delivering creative and customized solutions with uncompromising quality.',
    ],
    media: ['iqos-neon', 'caf-ball', 'oxi-display', 'iqos-wall', 'football-bags', 'robot-suit'],
    preview: 'iqos-neon',
    layout: 'slider',
  },
  {
    id: 'gifts',
    numeral: 'II',
    title: ['Promotional', 'gifts'],
    short: 'Promotional gifts',
    text: [
      'We design and produce custom promotional gifts that strengthen brand recognition, enhance customer engagement, and create memorable brand experiences.',
    ],
    media: ['bonjour-totes', 'aura-colors', 'promo-collage', 'heineken-cooler', 'sol-cooler', 'drinkies-tote'],
    preview: 'bonjour-totes',
    layout: 'slider',
  },
  {
    id: 'packaging',
    numeral: 'III',
    title: ['Packaging', 'solutions'],
    short: 'Packaging',
    text: [
      'We create innovative packaging solutions that combine functionality, aesthetics, and premium quality to elevate product presentation and reinforce brand identity.',
    ],
    media: ['packaging-stack', 'trevi-box', 'packaging-mass', 'raphael-bag'],
    preview: 'packaging-stack',
    layout: 'slider',
    feature: 'packaging',
  },
  {
    id: 'uniform',
    numeral: 'IV',
    title: ['Corporate', 'uniform'],
    short: 'Corporate uniform',
    text: [
      'We design and manufacture premium corporate uniforms that reflect brand identity, while ensuring comfort, durability, and professionalism.',
      'We create tailor-made uniform solutions that maximize product exposure and deliver engaging consumer experiences.',
    ],
    media: [
      'orange-guy',
      'heineken-duo',
      'oxi-blazer',
      'orange-girl',
      'mpg-barista',
      'sol-tee',
      'crystal-uniform',
      'heineken-2025',
      'total-polos',
      'rivoli-team',
      'rivoli-activation',
      'total-team',
      'promoters',
    ],
    preview: 'orange-guy',
    layout: 'people',
    feature: 'atelier',
  },
  {
    id: 'production',
    numeral: 'V',
    title: ['Mass', 'production'],
    short: 'Mass production',
    text: [
      'With advanced production capabilities and a reliable supply chain, we deliver large-scale manufacturing solutions while maintaining exceptional quality, consistency, and on-time delivery.',
    ],
    media: ['neck-labels', 'embroidery-caps', 'embroidery-laurel'],
    preview: 'embroidery-caps',
    layout: 'slider',
  },
  {
    id: 'giveaways',
    numeral: 'VI',
    title: ['Customized', 'giveaways'],
    short: 'Giveaways',
    text: [
      'Our giveaway solutions are designed to increase brand awareness and customer engagement through creative, high-quality promotional products.',
    ],
    media: [
      'iqos-totes',
      'sol-hat',
      'duffle-star',
      'iqos-bag',
      'wellwoman',
      'iqos-towels',
      'clear-bag',
      'sunny-cooler',
      'heineken-bag',
      'iqos-crossbody',
      'iqos-ornament',
      'backgammon',
      'ucl-ball',
      'star-waistbag',
      'trevi-blanket',
      'iqos-pouch',
      'iqos-market',
      'iqos-duffle',
    ],
    preview: 'iqos-totes',
    layout: 'mosaic',
    feature: 'keychain',
  },
  {
    id: 'pos',
    numeral: 'VII',
    title: ['POS', 'materials'],
    short: 'POS materials',
    text: [
      'We produce a comprehensive range of point-of-sale materials, including retail displays, signage, wobblers, shelf branding, and display stands that enhance in-store visibility and engagement.',
    ],
    media: ['dosh-pos', 'oxi-donia', 'rivoli-packs'],
    preview: 'dosh-pos',
    layout: 'slider',
  },
  {
    id: 'identity',
    numeral: 'VIII',
    title: ['Corporate', 'identity'],
    short: 'Corporate identity',
    text: [
      'We build brands by crafting impactful visual identities, logo systems, brand guidelines, and cohesive design solutions that ensure consistency across every touchpoint.',
    ],
    media: ['doctor-clean', 'identity-proposals'],
    preview: 'doctor-clean',
    layout: 'slider',
  },
  {
    id: 'communication',
    numeral: 'IX',
    title: ['Creative design', '& brand communication'],
    short: 'Brand communication',
    text: [
      'We develop compelling visual communications that bring brands to life through creative concepts, impactful artwork, marketing collateral, and engaging campaign designs that inspire audiences and drive results.',
    ],
    media: ['total-social', 'total-caf'],
    preview: 'total-social',
    layout: 'slider',
  },
  {
    id: 'visualization',
    numeral: 'X',
    title: ['3D design', 'and visualization'],
    short: '3D visualization',
    text: [
      'We create high-quality 3D visualizations and mockups that bring ideas to life and support product development, presentations, and marketing campaigns.',
    ],
    media: ['viz-night-wall', 'viz-cafes', 'viz-plant-stand', 'viz-totems', 'viz-wood-sign', 'viz-clocks'],
    preview: 'viz-night-wall',
    layout: 'slider',
    feature: 'viz',
  },
  {
    id: 'outdoor',
    numeral: 'XI',
    title: ['Outdoor', 'events'],
    short: 'Outdoor events',
    text: [
      'We design and execute high-impact outdoor advertising campaigns that strengthen brand presence, capture attention, and create memorable brand experiences.',
    ],
    media: ['remix-dj', 'remix-entrance', 'remix-booth', 'remix-stage', 'remix-vending', 'remix-entertainment'],
    preview: 'remix-dj',
    layout: 'slider',
  },
  {
    id: 'events',
    numeral: 'XII',
    title: ['Events', '& activations'],
    short: 'Events & activations',
    text: [
      'Raphael Studios offers end-to-end creative production solutions, specializing in event activations, team buildings, corporate events, and creative brand experiences.',
    ],
    media: [
      'superheroes',
      'back-to-90s',
      'ev-facepaint-1',
      'ev-facepaint-2',
      'ev-photo-card',
      'ev-facepaint-3',
      'ev-90s-1',
      'ev-gift-box',
      'ev-cart',
      'ev-90s-2',
      'ev-team',
      'ev-boxes',
    ],
    preview: 'superheroes',
    layout: 'mosaic',
    feature: 'polaroids',
  },
  {
    id: 'photography',
    numeral: 'XIII',
    title: ['Photography', 'services'],
    short: 'Photography',
    text: [
      'We offer professional photography services that showcase products, brands, and events through creative direction and high-quality execution.',
    ],
    media: ['total-night', 'marie-louis-1', 'riding-jacket', 'acapella', 'marie-louis-2', 'marie-louis-3', 'winter-street'],
    preview: 'total-night',
    layout: 'people',
  },
];

/** "Brands that trust us" (p3). `logo` names the cleaned file in src/assets/logos. */
export const brands: { name: string; logo: string }[] = [
  { name: 'Wintershall Dea', logo: 'wintershall-dea' },
  { name: 'TotalEnergies', logo: 'totalenergies' },
  { name: 'ADNOC Voyager', logo: 'adnoc-voyager' },
  { name: 'Al Ahram Beverages', logo: 'al-ahram' },
  { name: 'Philip Morris International', logo: 'philip-morris' },
  { name: 'Hany Saad Innovations', logo: 'hany-saad' },
  { name: 'Arma', logo: 'arma' },
  { name: 'Parkville', logo: 'parkville' },
  { name: 'Maridive', logo: 'maridive' },
  { name: 'Zen Architects', logo: 'zen-architects' },
  { name: 'Concentrix', logo: 'concentrix' },
  { name: 'Transmar', logo: 'transmar' },
  { name: 'Brix', logo: 'brix' },
  { name: 'Bobai', logo: 'bobai' },
  { name: 'Toyota', logo: 'toyota' },
  { name: 'IQOS', logo: 'iqos' },
  { name: 'Sami Amin', logo: 'sami-amin' },
  { name: 'Heineken', logo: 'heineken' },
  { name: 'Zadea', logo: 'zadea' },
  { name: 'BTM', logo: 'btm' },
  { name: 'Oxi', logo: 'oxi' },
  { name: 'StarVille', logo: 'starville' },
  { name: 'Zaro Architects', logo: 'zaro' },
  { name: 'Magic Pharma', logo: 'magic-pharma' },
  { name: 'Shutterstock', logo: 'shutterstock' },
  { name: 'Saudi Airlines Catering', logo: 'saudi-catering' },
  { name: 'Orange', logo: 'orange' },
  { name: 'Hla', logo: 'hla' },
  { name: 'Super Kids', logo: 'super-kids' },
  { name: 'Al Mokhtabar', logo: 'al-mokhtabar' },
  { name: 'Electrostar', logo: 'electrostar' },
  { name: 'Virgin Megastore', logo: 'virgin-megastore' },
  { name: 'Rivoli', logo: 'rivoli' },
  { name: 'Crystal', logo: 'crystal' },
  { name: 'Misr Pyramids Group', logo: 'mpg' },
  { name: 'Domty', logo: 'domty' },
  { name: 'Rixos Hotels', logo: 'rixos' },
  { name: 'Catrion', logo: 'catrion' },
  { name: 'El Hanim', logo: 'el-hanim' },
  { name: 'Linah Farms', logo: 'linah-farms' },
  { name: 'Erada Finance', logo: 'erada-finance' },
  { name: 'Kharafi National', logo: 'kharafi-national' },
  { name: 'Smart Furniture', logo: 'smart-furniture' },
];

export const nav = [
  { label: 'Work', href: '/#work' },
  { label: 'Services', href: '/#services' },
  { label: 'Atelier', href: '/atelier/' },
  { label: 'Approach', href: '/#approach' },
  { label: 'Contact', href: '/#contact' },
] as const;
