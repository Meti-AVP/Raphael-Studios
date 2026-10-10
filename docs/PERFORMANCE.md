# Performance

The first requirement of the brief: very fast and light on a computer and on a phone, with the 3D and the animation.

## Results (10 October 2026)

| | Phone (Lighthouse mobile, median of 3–5 runs) | Computer (Lighthouse desktop) |
| --- | --- | --- |
| Performance | 98 (first paint 1.5 s, largest paint 2.3 s, blocking 34 ms, layout shift 0) | 99 (0.34 s, 0.47 s, 0 ms, 0) |
| Accessibility · Best practices · SEO | 100 · 100 · 100 | 100 · 100 · 100 |

v3 measured again after the remake: the remade scenes weigh what v2's did (21.3 MB for the thirteen, against 21.7 MB;
each texture is a KTX2 of the same size and quality), so loading and drawing them costs the same.

Scrolling the whole page on a phone-speed processor (a computer slowed four times): 0.7 s of main-thread blocking in
total, the longest moment 0.2 s, once, when each studio starts.

`npm run verify` (46 checks in a real browser) passes.

## v4 (10 October 2026)

| | Phone (Lighthouse mobile) | Computer (Lighthouse desktop, median of 3) |
| --- | --- | --- |
| Performance | 97 in a quiet run (first paint 1.7 s, largest paint 2.4 s, blocking 47 ms, layout shift 0); about 70 in five of nine runs (largest paint 6.3 s) | 98 (0.38 s, 0.51 s, 0 ms, 0) |
| Accessibility · Best practices · SEO | 100 · 100 · 100 | 100 · 100 · 100 |

The phone runs were unsteady with the same build: a forgotten v2 development server (`astro dev --port 4521`, started
by an earlier session) kept about three processor cores busy during all of them, and Lighthouse's phone simulation
scales what the processor really did. To measure cleanly: stop it, then
`node D:/RAhpel/.work-raphael/lab/lh-median.mjs http://127.0.0.1:4700/ --runs 5 --full` with `npm start` running.

What v4 adds to the weight: the two new scenes (Photography 1.6 MB, Partners 1.6 MB of 3D, loaded only when near),
the shelf's pictures (13 × 10–30 KB, lazy), the tumbler (three.js is already there; its code is a few KB, loaded when
near). The page's HTML is the same size as v3's (40 KB Brotli). `npm run verify`: 54 of 54.

## v5 (11 October 2026)

What the second round adds, and when it loads:

| | |
| --- | --- |
| the page's HTML | 49 KB Brotli (40 KB in v4): the three showrooms, the atelier's three steps, the studios' new fields, the wall of gold |
| the first scene's still | 146 KB on a computer, 62 KB on a phone (the new hero) |
| the hero's 3D (computers, after the still) | 3.2 MB: two figures, the hologram skyline, the bag and what spills out of it (v4's hero: 1.7 MB) |
| a showroom | its code 3 KB; each piece 90–240 KB, one at a time, when the showroom comes near and as the reader goes to it |
| the atelier's polo and sweatshirt | 23 KB (`public/tee/garments.json`), only once one of them is chosen |
| the Partners scene | 1.3 MB (the hall, the founder, seven gold plaques) |

Nothing new loads before the first paint except the larger HTML. The JavaScript before the first paint is 13 KB, as
in v4. `npm run verify`: 59 of 59 (the showrooms, the atelier's polo and back print, the studios' requests, the wall).
Lighthouse was not run again in this round (the machine's v2 development server question above still stands).

## What a first visit loads

| Before the first paint | |
| --- | --- |
| HTML with all the CSS inlined | 31 KB (Brotli) |
| JavaScript (scroll, reveals, menu, the module loader) | 13 KB |
| Philosopher regular and bold (preloaded) | 43 KB |

| After the title is on screen | |
| --- | --- |
| the painting engine + three.js | 51 KB + 133 KB |
| the first scene: its still | 60 KB (phone) or 110 KB (computer) |
| on computers, the scene's 3D (models and textures) | about 1.7 MB for the hero, 1.5–1.9 MB per chapter |
| Source Sans 3, Imperial Script | 50 KB + 26 KB |

| When the reader comes near | |
| --- | --- |
| each chapter's scene | the 3D of the current and the next scene; the stills of the previous, current and next two |
| each studio | 1–9 KB of code, its 3D, the shared studio lighting (84 KB, once) |
| pictures | AVIF/WebP at the width their place needs, lazily |

## How

**The first paint waits for nothing.** The intro is CSS only; the fonts that draw the title are preloaded and their
fallbacks are sized to match (no shift when they arrive); the engine starts after the fonts and an idle moment, in
short tasks (its code, then the renderer, then the shaders, each in its own task; textures go to the GPU one per task).

**The scenes are light.** Models are compressed with meshopt and quantised, normals dropped where the painted
texture carries the light; textures are KTX2 (Basis Universal) decoded in a worker; only the current and next scenes' 3D is
loaded, the neighbours as stills; phones and weak devices see only stills rendered from the 3D, through the same
transitions.

**The studios cost nothing until used**, and little when they start:

- their code and models load when they come within a screen and a half;
- their lighting is baked once into a picture (`tools/env/bake-env.mjs`) instead of being built in each view: building
  it compiles a heavy filter shader, which used to stall a phone for most of a second per studio;
- their materials compile in parallel with the page, object by object, before the first frame
  (`studio-env.ts → compileInSteps`), with the shadow type three.js really uses (`PCFShadowMap`; the old soft type is
  converted at the first frame, which recompiled every material);
- canvas text is sized from one measurement (each new font size costs a lookup);
- the kiosk's static parts are merged per material (a dozen draws per pass instead of a hundred);
- each studio draws only while something moves, and nothing at all off screen; the giveaways' physics sleeps when
  the pile is still.

**The page itself stays cheap**: one frame loop for everything (`core/ticker.ts`); the scroll position and the
sections' positions are cached (nothing in a frame forces a layout); the stage measures the page when the browser is
idle; stills are decoded off the main thread; reveals use transforms and opacity.

## How to measure

```bash
npm start                                   # the production build on http://localhost:4700
npm run verify                              # the 46 checks (screenshots in .verify/)
```

Lighthouse medians were taken with the scripts in `D:\RAhpel\.work-raphael\lab` (`node lh-median.mjs <url> --runs 5
[--desktop] [--full] [--details]`). The machine is noisy: compare medians, not single runs.
