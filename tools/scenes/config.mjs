// The painted scenes: which reference scene each chapter of the site uses, and where its files come from.
// The reference is the local copy of Shopify Editions Winter '26 (D:\RAhpel\inspiration\shopiiiiy-site4), used with
// its makers' permission; every texture goes through tools/scenes/rebrand.py before it reaches the site.
//
// Asset kinds: 'glb' (a model with its animations), 'plane' (a picture on a 2 x 2 plane: the painted backdrop).
// Asset order matters: the timeline addresses them as asset-1, asset-2, ... exactly as the reference does.

export const REF = process.env.RAPHAEL_REF || 'D:/RAhpel/inspiration/shopiiiiy-site4/site/remote';
const M = `${REF}/editions-winter-2026.myshopify.com/cdn/shop/3d/models/o`;
const F = `${REF}/cdn.shopify.com/s/files/1/0951/3130/4218/files`;

/** @typedef {{ kind: 'glb' | 'plane', src?: string, local?: string, key?: string, optional?: boolean, remove?: string[], generate?: string, width?: number, height?: number, aspect?: boolean }} AssetSrc */
/** @typedef {{ id: string, ref: string, timeline: string, assets: AssetSrc[], poster: { desktop: string, mobile: string }, camera?: string }} SceneSrc */

/** @type {SceneSrc[]} */
export const scenes = [
  {
    // v5: the hero made anew, the studio's own (nothing of the reference's): two marble statues in a holographic Egypt;
    // the photographer's flash goes off and the studio's bag opens its doors and spills its work, one of its shirts,
    // one of its boxes. Made by tools/scenes/remake/hero_v5.py (the paintings), hero_v5_build.py (reliefs, holograms,
    // timeline) and hero_v5.mjs (the bag, the panorama, the shirt, the box, the flash)
    id: 'hero',
    ref: null,
    timeline: 'art/scenes/hero-v5/timeline.json',
    authored: true,
    assets: [
      { kind: 'glb', local: 'art/scenes/hero-v5/night.glb' },
      { kind: 'glb', local: 'art/scenes/hero-v5/holo-giza.glb' },
      { kind: 'glb', local: 'art/scenes/hero-v5/holo-cairo.glb' },
      { kind: 'glb', local: 'art/scenes/hero-v5/photographer.glb' },
      { kind: 'glb', local: 'art/scenes/hero-v5/model.glb' },
      { kind: 'glb', local: 'art/scenes/hero-v5/spill.glb' },
      { kind: 'glb', local: 'art/scenes/hero-v5/flash.glb' },
    ],
    poster: null,
  },
  {
    id: 'solutions', // I. Customized solutions: the cabinet, the catalogue, the products on cards
    ref: 'Agentic',
    timeline: `${F}/AgenticScene.theatre-project-state.json`,
    assets: [
      { kind: 'glb', src: `${M}/bba83c9869d8879f/Agentic_fg_251209_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/Agentic_Bg_windowscene-optimized.ktx2` },
      { kind: 'glb', src: `${M}/9567eaad495dfa3f/Rigged_Book_CS_Animated_V5_compressed-optimized.glb` },
      { kind: 'glb', src: `${M}/510af84586abddc1/EW26_Agentic_Props_251209v5_compressed-optimized.glb` },
    ],
    poster: { desktop: `${F}/Agentic_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Agentic_2x.ktx2` },
  },
  {
    id: 'gifts', // II. Promotional gifts: the beanie and the card
    ref: 'Checkout',
    timeline: `${F}/CheckoutScene.theatre-project-state_13.json`,
    assets: [
      // v3: the card is Raphael's gift card, without a chip
      { kind: 'glb', src: `${M}/f889c7c758e60536/EW26_Checkout_251209_compressed-optimized.glb`, remove: ['shiny-cardchip'] },
      { kind: 'plane', src: `${F}/Checkout_bg_diffuse-optimized.ktx2` },
    ],
    poster: { desktop: `${F}/Checkout_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Checkout_2x.ktx2` },
  },
  {
    id: 'packaging', // III. Packaging: the cheetah carries the box
    ref: 'Shipping',
    timeline: `${F}/ShippingScene.theatre-project-state_12.json`,
    assets: [
      // v4: the animal is gone (its body, bones and belt); a marble Hermes carries the box (hermes.py, asset 'statue')
      { kind: 'glb', src: `${M}/e8cd2871309d6b03/EW26_Shipping_251204_compressed-optimized.glb`, remove: ['Cheetah Loop.001', 'Belt'] },
      { kind: 'plane', src: `${F}/Shipping_bg_diffuse-optimized.ktx2` },
      // (last, so the reference's assets keep their numbers: the timeline addresses them as asset-1, asset-2)
      { kind: 'glb', local: 'art/scenes/packaging/hermes.glb', key: 'statue', optional: true },
    ],
    poster: { desktop: `${F}/Shipping_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Shipping_2x.ktx2` },
  },
  {
    id: 'uniform', // IV. Corporate uniform: the rider's cap
    ref: 'ShopApp',
    timeline: `${F}/ShopAppScene.theatre-project-state_8.json`,
    assets: [
      { kind: 'glb', src: `${M}/3ffd3b2a5abbe541/EW26_ShopApp_251208v3_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/ShopApp_bg_diffuse-optimized.ktx2` },
    ],
    poster: { desktop: `${F}/ShopApp_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Shopapp_2x.ktx2` },
  },
  {
    id: 'production', // V. Mass production: the guild around the table, the globe of the supply chain
    ref: 'Operations',
    timeline: `${F}/OperationsScene.theatre-project-state_8.json`,
    assets: [
      { kind: 'glb', src: `${M}/b44ac013cda7d317/EW26_Operations_251207_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/Operations_bg_diffuse-optimized.ktx2` },
      { kind: 'glb', src: `${M}/0337cd9bc6d18b55/Renaissance_Globe_251209v2-optimized.glb` },
    ],
    poster: { desktop: `${F}/Operations_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Operation_2x.ktx2` },
  },
  {
    id: 'giveaways', // VI. Giveaways: tokens rain on the juggler
    ref: 'Finance',
    timeline: `${F}/FinanceScene.theatre-project-state_7.json`,
    assets: [
      { kind: 'glb', src: `${M}/614d6d0fa1836313/EW26_Finance_251208v2_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/Finance_bg-optimized.ktx2` },
    ],
    poster: { desktop: `${F}/Finance_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Finance_2x.ktx2` },
  },
  {
    id: 'pos', // VII. POS materials: the shop wall and the display under the dome
    ref: 'Retail',
    camera: 'posxxlcamera',
    timeline: `${F}/RetailScene.theatre-project-state-cs-251209v2_b28f3c6c-7ab6-4036-9ac4-9f48df3024f0.json`,
    assets: [
      { kind: 'glb', src: `${M}/9eeb64e8194faa39/POS_V53_environment_251209v2_compressed-optimized.glb` },
      // v4: the terminal (its maker's product) becomes Raphael's gift box, on the same path (replace.mjs: posGiftBox)
      { kind: 'glb', src: `${M}/e51a31d48a973f83/POS_v53_Hub_251208v2_compressed-optimized.glb`, transform: 'posGiftBox',
        remove: ['pos-logo', 'pos-ports', 'pos-screws', 'pos-markings'] },
      // v4: the counter keeps its tablet (the studio's POS work on its screen); the skateboard, the reader, the scanner
      // and the cables go (replace.mjs: posCounter; the wall's decks became framed work: pos_v4.py)
      { kind: 'glb', src: `${M}/2f9637a8c00c276d/Retail_mg_251205v2_compressed-optimized.glb`, transform: 'posCounter',
        remove: ['pos-device-scanner', 'pos-reader', 'shine-poscordscanner', 'shiny-pos-cord-psu', 'shiny-pos-cord-usb-1',
          'shiny-pos-cord-usb-2', 'shiny-poscordethernet', 'usb-c-animatedcord', 'shiny-bar1'] },
    ],
    poster: { desktop: `${F}/Retail_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Retail_2x.ktx2` },
  },
  {
    id: 'identity', // VIII. Corporate identity: the painter at the easel
    ref: 'Online',
    timeline: `${F}/OnlineScene.theatre-project-state_1_5a646934-a79e-49ac-80a9-825d8a3fb221.json`,
    assets: [
      { kind: 'glb', src: `${M}/46aedb6ec0619620/EW26_Online_251209v3_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/Online_bg-brighter_251201v2-optimized_5cdbdf82-dff0-40c9-8c76-111f92afc5ee.ktx2` },
    ],
    poster: { desktop: `${F}/Online_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Online_2x.ktx2` },
    // v4: the monitor shows the studio's retouching app at work (src/scripts/stage/screens/editor.ts), on a quad the
    // build lays over the painted screen (tools/scenes/screen.mjs finds it); from/to: the scroll positions it spans
    // (the scene is fully in at ~1.0; the paper rises from 1.4 and covers the monitor near 2.2)
    screens: [{ id: 'editor', node: 'online_computer', from: 1.0, to: 2.15 }],
    // (the photograph the app retouches, put in the scene's folder by hand: the build keeps it)
    keep: ['editor-photo.webp'],
  },
  {
    id: 'communication', // IX. Creative design & brand communication: the creative at the laptop
    ref: 'Sidekick',
    timeline: `${F}/SidekickScene.theatre-project-state_14_910d17ff-f5fb-4da0-920e-1b66f8d229b3.json`,
    assets: [
      // v3: the shopping bag spinning in the armillary sphere (the reference's logo) is taken out; v4: the figure is a
      // statue without the reference's mask (statues.py), so its blinking eyelids go too
      { kind: 'glb', src: `${M}/63ac5b514230f82a/EW26_Sidekick_251208_compressed-optimized.glb`, remove: ['shiny-ring6', 'sidekick-eyelids'] },
      { kind: 'plane', src: `${F}/EW26_Sidekick_bg_stars-optimized_89d84022-03c9-4267-bb0f-71a26f688511.ktx2` },
    ],
    poster: { desktop: `${F}/Sidekick_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Sidekick_2x.ktx2` },
  },
  {
    id: 'visualization', // X. 3D design & visualization: the study drawing
    ref: 'Developer',
    timeline: `${F}/DeveloperScene.theatre-project-state_5.json`,
    assets: [
      { kind: 'glb', src: `${M}/0285be8865787635/EW26_Developer_251207v5_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/Developer_bg_diffuse-optimized.ktx2` },
    ],
    poster: { desktop: `${F}/Developer_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Developer_2x.ktx2` },
  },
  {
    id: 'outdoor', // XI. Outdoor: the billboard in the landscape
    ref: 'Marketing',
    timeline: `${F}/MarketingScene.theatre-project-state_12.json`,
    assets: [
      { kind: 'glb', src: `${M}/2e684892a34b58b8/EW26_Marketing_251209v4_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/Marketing_bg_retouched_v3-optimized.ktx2` },
      // the billboard: the reference showed a video here; Raphael's poster instead (drawn by rebrand.py)
      { kind: 'plane', generate: 'billboard', width: 1024, height: 1104 },
    ],
    poster: { desktop: `${F}/Marketing_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_Marketing_2x.ktx2` },
  },
  {
    id: 'events', // XII. Events & activations: the garden meeting
    ref: 'B2B',
    timeline: `${F}/B2BScene.theatre-project-state_4.json`,
    assets: [
      { kind: 'glb', src: `${M}/73f4d9f62ba07f6e/EW26_B2B_251205v2_compressed-optimized.glb` },
      { kind: 'plane', src: `${F}/B2B_Bg_Dark_251202-optimized.ktx2` },
    ],
    poster: { desktop: `${F}/B2B_desktop.ktx2`, mobile: `${F}/Fallback_Mobile_B2B_2x.ktx2` },
  },
  {
    // v4: Raphael's Portrait of Baldassare Castiglione (public domain) as a sitting in the studio: the wall and the
    // sitter's relief and the timeline are made by tools/scenes/remake/photography_v4.py (before: a still, stills.py)
    id: 'photography',
    ref: null,
    timeline: 'art/scenes/photography/timeline.json',
    authored: true,
    assets: [
      { kind: 'glb', local: 'art/scenes/photography/ground.glb' },
      { kind: 'glb', local: 'art/scenes/photography/sitter.glb' },
    ],
    poster: null,
  },
  {
    // v5: the founder in an Egyptian temple hall painted for the studio (hall_v5.py), the brands that trust the studio
    // set in gold on its columns, appearing one by one (partners_v5.py; the founder's relief: founder.py)
    id: 'partners',
    ref: null,
    timeline: 'art/scenes/partners/timeline.json',
    authored: true,
    assets: [
      { kind: 'glb', local: 'art/scenes/partners/backdrop.glb' },
      { kind: 'glb', local: 'art/scenes/partners/founder.glb' },
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ kind: 'glb', local: `art/scenes/partners/logo-${i}.glb` })),
    ],
    poster: null,
  },
];

/** shared textures every scene shader samples */
export const shared = {
  mudNormal: `${F}/mud_normal.webp`,
  studioEnv: `${F}/studio_small_09_1k.pmrem.ktx2`,
};
