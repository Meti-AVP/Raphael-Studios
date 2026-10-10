# The scenes in v4: statues, our own scenes, live screens

v3 remade the reference's thirteen painted scenes as the studio's own ([`REMAKE.md`](REMAKE.md): new faces, clothes,
products, places). v4 takes them a step further, so that nobody who knows the original could mistake them for it:

* **every figure is a white marble statue** in the manner of classical Greek sculpture, carved anew, while the studio's
  products and turquoise accents keep their colours: the studio's identity (Raphael, the Renaissance, the antique)
  meeting the Egyptian places behind them;
* **what the reference was known by is gone**: the cheetah, the skateboard, the payment terminal and its cables, the
  sidekick's mask and its blinking eyelids, the 3D chapter's headphones;
* **two scenes are entirely the studio's**, made from Raphael's own paintings (public domain), with no geometry from
  the reference: the founder in *The School of Athens*, and the photography chapter's sitting with Baldassare
  Castiglione;
* **the painter's monitor is alive**: it shows the studio's retouching app at work, driven by the scroll.

## What changed, scene by scene

| Scene | v4 |
| --- | --- |
| Hero | both figures marble statues, their heads carved anew (`statues_hero.py`); the skateboard is taken out of the scene |
| Solutions · Gifts · Uniform · Production · Giveaways · Identity · Events | the figures in marble, heads and bodies carved anew; products, turquoise turban, cap and bridle in colour (`statues.py <scene>`) |
| Packaging | the cheetah (and its belt) is out; a marble **Hermes**, the messenger, holds the studio's turquoise box over his head on the same pedestal (`hermes.py`, `art/scenes/packaging/hermes.glb`) |
| POS | the payment terminal became the studio's **gift box** on the same path (`replace.mjs: posGiftBox`); the skateboard, the reader, the scanner and every cable are out; the wall's decks became the studio's work, framed (`pos_v4.py`, `giftbox.py`) |
| Identity | the monitor shows the studio's retouching app: a photograph is graded, masked and finished while the reader scrolls (`src/scripts/stage/screens/editor.ts`, laid over the painted screen by `tools/scenes/screen.mjs`) |
| Communication | the creative is a statue **without the mask**: the mask's band filled from the face, the eyes carved as a statue's, the head carved whole; the blinking eyelids are taken out of the scene (`statues.py communication`) |
| 3D (visualization) | the drawing became a study after the antique: **the headphones and their cord are drawn out**, curls and a carved ear where they were, a statue's blank eye (`visualization_v4.py`) |
| Photography | **a new scene**: Castiglione's portrait parted by its depth into the sitter (a relief that breathes) and his wall (widened for the screen, its canvas grain kept); the camera steps in like a photographer (`photography_v4.py`) |
| Partners | **a new scene**: the founder (his own photograph, in brunaille) in front of *The School of Athens*, both raised in depth (`founder.py`) |

## How it is made

* **marble** (`statue.py: marble`): a gradient map from dark grey to warm white over the old lightness, with each
  material's colours flattened (k-means classes, then a large blur) so a dark velvet and a pale sleeve become the same
  stone, and a few soft veins; `match_light` brings carved parts to the same light.
* **carving** (`statue.py: carve`): SDXL inpainting guided by the part's own edges (canny ControlNet), prompted as a
  classical marble statue with blank stone eyes, on the heads and the bodies.
* **painting what the camera sees** (`uvpass.mjs` + `project.py`): some textures are cut into a hundred charts (the
  3D chapter's drawing); a change across them is painted in the frame the camera sees instead. `uvpass.mjs` renders,
  for one timeline position and a widened view, which texel every pixel of the frame shows (12 bits a coordinate,
  packed in RGB); `project.py` rebuilds the frame from the texture, and after the painting carries every pixel back to
  its texel and refills the charts' padding.
* **reliefs** (`relief.py`, `relief.mjs`): a picture raised along the camera's rays by its depth (Depth Anything V2
  Small, Apache 2.0), written as a GLB with the picture as its unlit texture; `breathe` adds a slow looping lift.

On this machine SDXL shares 16 GB with everything else (Windows counts the card's memory in the commit charge): stop
the dev server while painting, and paint long thin parts at a smaller size (`area=768 * 768`). One SDXL process at a
time: `paint.py` takes `D:/RAhpel/.work-raphael/ai/gpu.lock` (shared with the other versions' work).

## Files

| | |
| --- | --- |
| `tools/scenes/remake/statue.py` | marble, carve, light matching |
| `tools/scenes/remake/statues.py [scene]`, `statues_hero.py` | the statues of each scene |
| `tools/scenes/remake/hermes.py` | the Hermes statue for Packaging |
| `tools/scenes/remake/giftbox.py`, `pos_v4.py`, `tools/scenes/replace.mjs` | the gift box and the POS counter |
| `tools/scenes/remake/visualization_v4.py` | the 3D chapter's study after the antique |
| `tools/scenes/remake/uvpass.mjs`, `project.py` | painting in the camera's frame and carrying it back |
| `tools/scenes/remake/founder.py`, `photography_v4.py` | the two new scenes (reliefs and their timelines) |
| `tools/scenes/screen.mjs`, `src/scripts/stage/screens/editor.ts` | the live monitor |
| `D:/RAhpel/.work-raphael/v4-art/` | v4's work folder: `base/` (v3's textures, the starting point), `<scene>/src,uv,out`, `_cache/` (every painting, keyed by what makes it) |

To redo a scene: its script, then `npm run scenes -- --only <scene>`, then `node tools/scenes/posters.mjs --only
<scene>` with the dev server running.
