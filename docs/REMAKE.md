# The remake of the painted scenes (v3)

v2 showed the reference's thirteen painted scenes rebranded: its pinks turned turquoise, its logos turned into the
studio's R. v3 remakes them. The technique stays exactly the same: projected paintings on relief meshes, the same
animation, the same burn between chapters. What changes is everything the eye reads in them: the people, what they
wear and carry, the animal, and every place behind them. They become the studio's own scenes, in its colours, set in
Cairo and Egypt seen with Renaissance eyes.

## What changed, scene by scene

| Scene | Figures | What they carry | The place behind |
| --- | --- | --- | --- |
| Hero | her robe turquoise silk, his cape saffron velvet over an indigo doublet; both heads painted anew | her cup a turquoise tumbler with an ivory lid; his bag the studio's own burgundy bag with a gold seal; the board printed with Raphael's *School of Athens* | a garden of old Cairo: date palms, cypresses, a great dome and minarets |
| Solutions | the scholar in deep turquoise velvet, a new face | the cards' products made the studio's (the cap's R in gold, the tee's gold embroidery, the deck's *School of Athens*, the sneakers' R label); the catalogue's pages show the studio's own work | a Mamluk hall, pointed arches, mashrabiya |
| Gifts | dark hair, a new face, a terracotta gown; the beanie became a turquoise silk turban with gold brooches | the studio's ivory gift card with a gold-foil R (the chip is gone) | the Nile, a felucca, palms |
| Packaging | the cheetah became a bronze cat of old Egypt (polished bronze, a turquoise patina in its hollows), its cloth lapis blue, its head painted as a cat's | the studio's turquoise box (v2); the pedestal's reliefs Mamluk arabesques | Alexandria by moonlight: the citadel, a minaret |
| Uniform | ivory linen tunic, turquoise velvet cloak, dark hair, a new face; the horse's bridle turquoise | the studio's cap (v2) | a dune at dusk |
| Production | five new faces; the chairs turquoise velvet, the merchant's coat wine velvet | the globe hand-coloured anew: sepia lands, turquoise seas, a gold star on Cairo, the studio's compass rose | a dark turquoise room with pointed arches |
| Giveaways | the juggler in saffron silk | the coins became the studio's enamel pins (turquoise, gold rim, gold R) | a lotus pond at night |
| POS | — | the shelves hold the studio's products; the floor's inlay a Mamluk star; the dome's oculus a gold star rosette on lapis | the Nile valley through the arches |
| Identity | the painter in turquoise velvet | the canvas shows the studio's identity (v2) | a saffron brocade curtain, a window on the domes and minarets of Cairo |
| Communication | a new face, saffron sleeves | the vase a turquoise glaze; the laptop's old logo wiped, the R etched alone; the table's carving holds the R | the stars over the pyramids of Giza |
| 3D | the drawing in turquoise ink instead of red chalk | the studies he points at are the studio's own drawings (a dieline, a gift box, a booth, a tee, a cap, a tote, a roll-up) | the sheet behind: its framed portrait became the R in a laurel |
| Outdoor | — | the billboard (v2) | the mountains became the plateau of Giza with its pyramids, the lake the Nile with its feluccas; the trees painted anew |
| Events | his suit turquoise, her gown terracotta, both heads painted anew | the laptop's R (v2) | a courtyard of old Cairo, striped arches, lanterns |

The intro's construction drawing is the studio's own too: the frame's thirds and diagonals, an eight-pointed star of
Cairo's geometry, compass arcs from the frame's corners and the construction of the R (`src/components/SideAndLines.astro`).
The scenes' stills (shown before the 3D, and on its own on phones that cannot run it) are rendered from the remade
scenes, never taken from the reference: `tools/scenes/build.mjs` copies them from `art/posters/`.

## How it is made

Two kinds of edit, both keeping every painted fold, highlight and shadow:

* **colour** (`gradient_map`, `hue_move` in `paint.py`): a new colour ramp over the old lightness, inside a mask. Used
  for the chart-packed textures (robes and fur cut into hundreds of islands, where a painting would break at every
  seam): the islands are classified by colour (k-means in Lab) island by island, and the padding between them is
  refilled from their new colours (`bleed`), so the mipmaps never show the old ones.
* **paint** (`Painter` in `paint.py`): SDXL inpainting guided by the texture's own edges (a canny ControlNet), for
  the textures that are one painting (faces, heads, a room, a landscape, a backdrop). Outside its mask a texture stays
  exactly as it was.

The models (in the Hugging Face cache on D:, `D:/RAhpel/.work-raphael/ai/hf`):
`diffusers/stable-diffusion-xl-1.0-inpainting-0.1` and `diffusers/controlnet-canny-sdxl-1.0-small` (CreativeML Open
RAIL++-M), `madebyollin/sdxl-vae-fp16-fix` (MIT). On this computer (8 GB RTX 3050, 16 GB) Windows counts the graphics
card's memory in the commit charge too, and SDXL does not fit beside the rest: the painter therefore maps the big
weights read-only from disk and moves them to the card a layer at a time (`mapped_safetensors`, accelerate's
`cpu_offload`); a picture takes about 1 to 1.5 minutes.

## Files

| | |
| --- | --- |
| `tools/scenes/art.mjs <scene\|all>` | exports each scene's textures as v2 left them, the sources of the remake (`D:/RAhpel/.work-raphael/v3-art/<scene>/src/`) |
| `tools/scenes/remake/uvmasks.mjs <scene\|all>` | where each mesh paints in its textures, as masks (`…/v3-art/<scene>/uv/`) |
| `tools/scenes/remake/paint.py` | the tools: textures, masks, colour edits, the painter, previews |
| `tools/scenes/remake/<scene>.py` | each scene's edits (`packaging_scene.py` for Packaging: a `packaging.py` would hide the Python library of that name); `backdrops.py` the backdrops; `studies.py` the 3D scene's drawings |
| `tools/scenes/remake/look.mjs [--only hero]` | a screenshot of each remade scene in the site (needs `npm run dev`) |
| `art/scenes/<scene>/<texture>.png` | the remade textures: `tools/scenes/build.mjs` takes them in place of the reference's |
| `art/posters/<scene>-d.avif`, `-m.avif` | the stills rendered from the remade scenes (`tools/scenes/posters.mjs`) |

To redo a scene: `py tools/scenes/remake/<scene>.py` (add `--no-paint` to redo only the colour edits; the paintings
are cached by everything that makes them, in `…/v3-art/_cache/`), then `npm run scenes -- --only <scene>`, then
`node tools/scenes/posters.mjs --only <scene>` with the dev server running.
