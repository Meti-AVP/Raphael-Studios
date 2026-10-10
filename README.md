# Raphael Studios — Creative Hub · website (v4)

The portfolio site of Raphael Studios Creative Hub (Cairo, since 2011), a full-service creative branding and production
agency. It tells the studio's 2026 company profile as an *edition*: a construction drawing that becomes the title
frame, thirteen chapters each opening over its own painted 3D scene, paper that tears in over the paintings to carry
the work, and interactive studios in which a visitor makes something real with their own brand.

v4 keeps v3's technique and its remade scenes, and goes further where it shows:

* **the scenes are unmistakably the studio's**: every figure is a white marble statue in the manner of classical Greek
  sculpture (the studio's Renaissance identity meeting the Egyptian places behind them); what the reference was known
  by is gone (the cheetah is now a marble Hermes holding the studio's box, the payment terminal is the studio's gift
  box, the skateboard, the cables, the sidekick's mask and the headphones are out); two scenes are entirely new, made
  from Raphael's own paintings (the founder in *The School of Athens*, and Castiglione's portrait for Photography); the
  painter's monitor shows the studio's retouching app at work as the reader scrolls: [`docs/REMAKE-V4.md`](docs/REMAKE-V4.md);
* **the work is presented wider and with agua's feel**: the paper takes the whole width, the work ribbon drags with the
  weight and glide of the slider on Agrumea's site, the Gifts chapter opens with a tumbler that rises, leans and turns
  over its title (and takes the reader's brand), and the page closes with a shelf of every chapter whose cards fill
  with falling letters.

and its second round (v5: [`docs/REMAKE-V5.md`](docs/REMAKE-V5.md)) makes it the studio's own all through:

* **a hero of its own**: a marble photographer fires his flash at a model holding the studio's bag, and the studio's
  real work pours out of the bag's doors (an arc of its projects, a real T-shirt, a real gift box) before a night Egypt
  drawn as holograms;
* **the real work in 3D**: Uniform, Giveaways and Packaging open with a showroom of pieces the studio actually made
  (the MPG and TotalEnergies polos, the star duffle, the Sunny cooler, the studio's own bag, the Oxi and Concentrix
  boxes…), each modelled from its photograph and presented as agua presents its jars;
* **make anything, precisely**: the atelier makes a T-shirt, a polo or a sweatshirt, with a mark on each of four
  places, each its own words or logo, technique, colour and size, then writes the order and a spec sheet; the
  giveaways and the packaging take the brand's logo, any colour, the set or the size, and how many;
* **Partners** in an Egyptian temple hall, the brands in gold on its columns and on a wall of gold.

> **تشغيل سريع:** افتح terminal في المجلد ده واكتب `npm start` وبعدين افتح <http://localhost:4700>.
> لو هتعدّل وتشوف التغيير على طول: `npm run dev` وافتح <http://localhost:4721>.
> محتاج Node 22.12 أو أحدث. أول مرة: `npm install`.
>
> النسخ القديمة زي ما هي، متلمستش: v1 في `D:\RAhpel\raphael-studios` و v2 في `D:\RAhpel\raphael-studios-v2` و v3 في `D:\RAhpel\raphael-studios-v3`.

## What is on the page

| Part | |
| --- | --- |
| **The intro** | the studio's construction drawing (the frame's thirds, an eight-pointed star, compass arcs, the construction of the R) draws itself while the first painting loads, then closes into the title frame: *Raphael Studios*, *Creative Hub* in script, the tagline, and the index of the thirteen chapters |
| **Thirteen chapters** | Solutions, Gifts, Packaging, Uniform, Production, Giveaways, POS, Identity, Campaigns, 3D, Outdoor, Events, Photography. Each opens with its title over a living 3D painting that follows the scroll and burns into the next. Then the paper: a **statement** with the work's pictures set in its line, **exhibits** (a studio in an app window, or a picture that comes out of its frame in 3D), a **gallery** to drag and fling, and **what we do**: the services, numbered, a picture following the pointer, and the way to start a project |
| **The showrooms** | Uniform, Giveaways and Packaging open with the real pieces the studio made, in 3D, beside their photographs: a bar goes from one to the next under a panel of its colour; "Make yours" opens the chapter's studio |
| **The studios** (try it with your brand) | **Uniform**: the atelier, in three steps: a T-shirt, polo or sweatshirt (cloth physics) in any colour; a mark on each of four places (words or logo, font, embroidery or print, colour, size, height); the order by size, sent on WhatsApp or saved as a spec sheet · **Packaging**: a mailer box that folds itself from its die-cut sheet, with a lid that hangs on its crease; its finish, the brand's logo, the size, how many, what goes with it · **Giveaways**: branded things rain onto the sand and pile up (rigid-body physics), with the brand's logo in any colour, the pieces of the set, how many · **3D**: a kiosk split between its technical drawing and its render · **Events**: an instant camera hands out prints that develop · **Outdoor**: your name on the billboard in the painting |
| **Partners** | the founder in an Egyptian temple hall, the brands in gold on its columns (a 3D scene of its own), the studio's approach in his words, the brands that trust it on a wall of gold, and the shelf of everything the studio makes |
| **Footer** | the invitation, WhatsApp, phone, e-mail, office and studio, the wordmark; **Privacy** and **Credits** pages |
| **404** | “This page is not painted yet.” |

Everything runs in the browser. Nothing a visitor types, uploads or photographs is sent anywhere: the camera is used
only after they allow it, the picture stays on their device, and every "Ask about this" link only opens WhatsApp with
a message they can read before sending. No analytics, no cookies, no third-party requests.

## The legal switch

`src/content/policy.ts` lists the pictures and brands that a stricter host or market may not allow (tobacco, alcohol,
a celebrity): put the kind in `hide` (e.g. `export const hide = ['tobacco', 'alcohol']`) and those pictures and logos
leave every part of the page at the next build. The scenes use none of them.

## Commands

```bash
npm install        # once
npm run dev        # development server with live reload: http://localhost:4721
npm run build      # the production site in dist/ (static files)
npm start          # build, then serve dist/ like a production host (compressed): http://localhost:4700
npm run preview    # serve the existing dist/ without rebuilding
npm run verify     # checks in a real browser (desktop, phone, reduced motion, 404, privacy, credits); screenshots in .verify/
npm run scenes     # rebuild the 3D scenes (the reference's geometry with the remade textures of art/scenes/)
```

Tools that are run by hand, when their inputs change:

| | |
| --- | --- |
| `py tools/scenes/remake/<scene>.py` | a scene's remake (colours, repaintings): [`docs/REMAKE.md`](docs/REMAKE.md) |
| `node tools/scenes/posters.mjs [--only hero]` | renders each scene's stills (computer and phone) from the 3D itself; needs `npm run dev` running |
| `py tools/scenes/remake/founder.py`, `photography_v4.py` | the two scenes made from Raphael's paintings (Partners, Photography) |
| `py tools/scenes/remake/hero_v5.py`, `hero_v5_build.py` | the hero: the figures, then the scene (the bag and the spill: `hero_v5.mjs`) |
| `py tools/scenes/remake/hall_v5.py`, `partners_v5.py` | the Partners hall and the brands in gold on its columns |
| `node tools/scenes/remake/products.mjs`, `products_soft.mjs`, `products_pack.mjs` | the showrooms' models (`public/showroom/`), from the work's photographs |
| `node tools/tee/garments.mjs` | the polo's and the sweatshirt's parts for the atelier (`public/tee/garments.json`) |
| `node tools/shelf.mjs` | the shelf's pictures, cut from the phone stills (after `posters.mjs`) |
| `node tools/tee/build-tee.mjs` | sews the T-shirt from its pattern (`public/tee/`) |
| `node tools/env/bake-env.mjs` | bakes the studios' lighting (`public/studio/room-env.png`) |
| `node tools/og.mjs` | the share picture (`public/og.jpg`) from the built site; needs `npm start` running |

`verify`, `posters` and `og` need Chrome or Edge installed (or `CHROME_PATH`).

## Results (10 October 2026, v4)

| | Phone | Computer |
| --- | --- | --- |
| Lighthouse | Accessibility 100 · Best practices 100 · SEO 100; Performance 97 in a quiet run (largest paint 2.4 s), but between 70 and 97 from run to run on this machine today (see below) | Performance 98 · Accessibility 100 · Best practices 100 · SEO 100 (median of 3) |
| `npm run verify` | 59 of 59 checks pass after the v5 round (desktop with the showrooms and the studios, phone, reduced motion, 404, privacy, credits) | |

The phone's performance score was unsteady during the measurements: in four of nine runs it was 97 (first paint
1.7 s, largest paint 2.4 s), in the other five about 70 (largest paint 6.3 s), with the same build. A forgotten v2
development server was using about three processor cores all the while (Lighthouse simulates a slow phone from what
the processor actually does, so a busy machine shows in it); measure again once it is stopped.

v5 adds the new hero (3.2 MB of 3D on computers, after its still), the showrooms (90–240 KB a piece, one at a time)
and 9 KB to the HTML; Lighthouse was not run again in that round. The 3D of the fifteen scenes weighed 21.1 MB in all
in v4 (the thirteen remade ones as in v3, plus the two new ones), loaded
one at a time as the reader comes near; a first visit loads 40 KB of HTML (Brotli), 12 KB of JavaScript and 43 KB of
fonts before the first paint. Details: [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## Folder structure

```
raphael-studios-v4/
├── README.md
├── package.json · astro.config.mjs · tsconfig.json
├── art/
│   ├── scenes/           the remade textures, one PNG per texture (the build takes them in place of the reference's)
│   └── posters/          the scenes' stills, rendered from the remade scenes
├── docs/
│   ├── CONCEPT.md · CONTENT.md · PERFORMANCE.md · CREDITS.md
│   ├── REMAKE.md         v3: what changed in every scene, how, and how to redo it
│   ├── REMAKE-V4.md      v4: the statues, the new scenes, the live monitor
│   └── REMAKE-V5.md      v5: the hero, the showrooms of real work, the studios, the Partners hall
├── public/               served as is: scenes/, showroom/, tee/, studio/, decoders/, fonts, icons, og.jpg, robots.txt, sitemap.xml
├── src/
│   ├── pages/            index.astro · privacy.astro · credits.astro · 404.astro
│   ├── layouts/          Base.astro
│   ├── components/       SideAndLines (intro, frame, index), Header, Chapter, Statement, Exhibit, Gallery, Offer,
│   │                     Partners, Tumbler, Shelf, Footer, Doc, Media, and the studios (Tee, Box, Rain, Viz, Booth)
│   ├── content/          edition.ts (the chapters), site.ts (the studio), showroom.ts (the real pieces), policy.ts (the legal switch), captions.ts,
│   │                     media.ts + media.generated.json, logos.generated.json
│   ├── styles/           tokens, base, motion, chapter, studio, work (v3's presentation)
│   ├── assets/           the pictures and logos (optimised at build time)
│   └── scripts/          app.ts, core/, stage/ (the painting engine), modules/ (gallery, offer, depth, studios), tee/, box/, rain/, viz/
└── tools/                scenes/ (3D pipeline; remake/ the scenes' remake), tee/, env/, content/, fonts/, og.mjs, serve.mjs, verify.mjs
```

## Changing things

| To change | Edit |
| --- | --- |
| a chapter's title, statement, exhibits, services | `src/content/edition.ts` |
| the studio's details (phone, WhatsApp, e-mail, address), services, brands, long texts | `src/content/site.ts` |
| which pictures and brands may show | `src/content/policy.ts` |
| colours, fonts, sizes | `src/styles/tokens.css` |
| pictures | put the originals where `tools/content/build_media.py` reads them, run it; reference them by id |
| a scene | its script in `tools/scenes/remake/`, then `npm run scenes -- --only <id>` and `node tools/scenes/posters.mjs --only <id>` |
