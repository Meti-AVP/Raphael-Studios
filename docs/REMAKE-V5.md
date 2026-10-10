# v5: a hero of our own, the real work in 3D, a studio to make anything

The second round on v4 (October 2026). Four things changed in what the visitor sees, and a number of fixes went in
under them. Each part says what it is, how it was made, and how to make it again.

## 1. The hero: the photograph and the bag

The first scene was the reference's (a reverse image search found it on its maker's site). It is replaced by one made
for the studio, in the same manner as the other scenes (marble figures, a painted Egypt behind them, the burning edge
between scenes):

* **two marble figures**: a photographer, his camera raised; facing him, a model holding the studio's own bag
  (`media/raphael-bag.png`: red paper, RAPHAEL STUDIOS, a pair of doors on its front that open onto a tailor's shop);
* **a darker night** behind them, with Giza and Cairo's skyline as **holograms**: turquoise light, scan lines, a band
  passing up them, a flicker;
* as the intro plays (and as the reader scrolls), **the flash fires**: the whole picture goes white for an instant; the
  bag's doors fly open, light pours out, and **the studio's real work** comes out of it in an arc of panels (the
  Rivoli and Oxi boxes, the TotalEnergies polos, the MPG barista, a Castello di Trevi box…), with a **real T-shirt**
  (the studio's own, its label at the neck) and a **real Rivoli gift box** tumbling out.

| Step | Made by |
| --- | --- |
| the two figures, painted (SDXL inpainting with a canny ControlNet, prompts with the action first) and chosen from candidates | `tools/scenes/remake/hero_v5.py cands · outpaint · clean · sheet` |
| each figure cut out (depth against a fitted ground, then GrabCut) and made a relief that breathes; the holograms; the night; the timeline | `tools/scenes/remake/hero_v5_build.py` (writes `anchors.json`, then runs `hero_v5.mjs`) |
| the bag (front with the doorway cut, the shop inside, doors on hinges, rope handles), the panels, the shirt, the box, the flash | `tools/scenes/remake/hero_v5.mjs` (shared geometry in `glbkit.mjs`) |
| the engine's flash and holograms | `src/scripts/stage/shaders.ts` (`uFlash`, `hologramFrag`), `materials.ts` (a material named `holo…` draws as a hologram, `glow…` as added light) |

Output: `art/scenes/hero-v5/` (seven GLBs and the timeline), listed for the hero in `tools/scenes/config.mjs`. The
stills (the phone shows the still) come from `node tools/scenes/posters.mjs --only hero`, taken where the intro comes
to rest, the work spilled out of the bag.

## 2. The showrooms: the real work, in 3D, presented as agua presents its jars

In Uniform, Giveaways and Packaging, the first thing under the chapter's title is now a **showroom**
(`src/components/Showroom.astro`, `src/scripts/modules/showroom.ts`): the piece's name very large, the piece in 3D in
front of it (it sways to show its depth; a drag turns it right round), the client and what was made on either side,
the real photograph beside it ("the real one"), and a bar to go from one piece to the next. A change goes as on
Agrumea's site: a panel in the piece's colour rises over the stage (0.55 s), everything changes under it, it lifts
away (0.62 s) and the new piece comes up into its place. "Make yours" opens the chapter's studio under the stage;
"Ask about this" writes the WhatsApp message about that piece.

| Collection | Pieces (each from its photograph) |
| --- | --- |
| Uniform | MPG barista polo, TotalEnergies polo, Orange crew sweatshirt, the studio's own tee |
| Giveaways | star duffle, star waist bag, "Welcome to the Sunny Side" cooler, Castello di Trevi blanket |
| Packaging | the studio's bag (its doors open as it comes on), Rivoli gift box, Oxi box (opened, the product in it), Concentrix gift set (cork card holder, pens, key ring in black foam) |

The list is `src/content/showroom.ts` (name, client, what, photograph, colours, how the model sits). The models are
`public/showroom/<id>.glb` (90–240 KB each, loaded one at a time), built by:

| | |
| --- | --- |
| `node tools/scenes/remake/garment_atlas.mjs` then `node tools/scenes/remake/products.mjs` | the garments: the atelier's sewn shirt made into each (a polo's collar and placket, a sweatshirt's long sleeves; `garments.mjs`), dressed as made; the Rivoli box |
| `node tools/scenes/remake/products_soft.mjs [id]` | the soft goods: rounded padded shapes, straps, a rolled blanket (`shapes.mjs`); their prints drawn in millimetres on each face so nothing stretches |
| `node tools/scenes/remake/products_pack.mjs [id]` | the boxes and the bag (trays, lids on hinges, pens, a key ring); the logos are the clients' own (`src/assets/logos`) |

## 3. The studios: make anything, precisely

**The atelier** (Uniform) is now an inspector in three steps:

1. **Garment**: a T-shirt, a polo or a sweatshirt, its fabric (jersey 180 or 220 gsm, piqué, fleece) and its colour
   (seven, or any). The polo's collar, placket and buttons and the sweatshirt's long sleeves and cuffs
   (`public/tee/garments.json`, from `node tools/tee/garments.mjs`) ride the simulated cloth: each point of them is
   bound to the triangle of the shirt it lies on (a long sleeve to a frame of its hem), so they move with it.
2. **Design**: a mark on each of four places (left chest, front, back, sleeve), each with its own words or logo, font,
   technique (embroidery or screen print), colour (any, or a logo's own colours), size (shown in centimetres) and
   height; the shirt turns to show the place being designed.
3. **Order**: how many of each size; the spec written out as it changes; **Send it to Raphael** (WhatsApp, the whole
   spec in the message) or **Save the spec sheet** (a picture: the shirt from the front and from the back, and every
   choice).

**Giveaways**: the brand's logo (or its name) on every piece, in the brand's colour (any) or its own; which pieces are
in the set (only those fall); how many sets. **Packaging**: the box's size, how many, and what goes with it (printed
inside, tissue, a seal, a ribbon, an insert). Where the 3D cannot run, each studio's form still writes its request.

## 4. Partners

The founder now stands in an **Egyptian temple hall** painted for the studio (a hypostyle hall in the manner of the
Orientalist paintings of Karnak: `hall_v5.py`), and seven of the brands that trust the studio are **set in gold on its
columns**, each appearing with the burning edge as the reader scrolls (`partners_v5.py`). Under it, the moving rows of
logos became a **wall of gold**: the count large, every logo inlaid in gold on dark velvet, a slow light passing over
them, the cells coming in one after another.

## Fixes that went in with it

* **The tumbler's "Your brand"** could not be typed into: the title lay over it.
* **Scale**: the paper's margins, the statements, the exhibits and the studios were too large on a wide screen; they
  are held to a width now, and the studios fit the screen's height.
* **The T-shirt**: it shook (stiff stretch fought the body it rests on), would not turn to its back easily, and a hard
  pull could throw it out of the frame. The stretch is a little soft, contact takes the speed out, every point is held
  within 25 cm of where it rests; a drag turns it (Pull is a mode), with Front, Side and Back buttons.
* **The back and one sleeve never showed a print**: those pieces were sewn with their faces turned in, so the shader
  took their outside for the inside. Each piece's facing is now worked out when the shirt loads.
* **A visibility observer** read the first entry of a batch, which can be an older one: the atelier opened inside the
  showroom could stay blank. Every observer now reads the latest entry.
* **Phones**: the showroom's bar scrolls sideways (the chosen piece comes to its middle), the header's button no
  longer wraps.

## Legal notes

* The figures and the hall are painted by Stable Diffusion XL for the studio; no reference picture is in them.
* The showroom's models are the studio's own work for these clients, shown with their logos as made: confirm with each
  client that the work may be shown (the policy switch in `src/content/policy.ts` hides tobacco, alcohol or talent
  work across the site at the next build).
* The partners' wall shows every brand of the studio's list; tobacco and alcohol brands are on it while `hide` is
  empty, as before.
