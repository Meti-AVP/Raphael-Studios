# Concept

## The idea: the studio's year, as an edition

Raphael Studios is named after a Renaissance painter, works for brands, and has a story told chapter by chapter in its
2026 company profile. Shopify's *Editions* page tells a product year in the same way: a construction drawing, a title
frame with an index, then chapter after chapter, each opening over its own living painting before the content arrives on
paper. Version 2 takes that structure whole and tells Raphael's year with it.

| | Shopify Editions (the reference) | Raphael Studios v2 |
| --- | --- | --- |
| Loading | "Da Vinci" construction lines (a golden-section drawing) draw while the scene loads, then close into a frame | the same drawing and timing; the frame holds *Raphael Studios* in Philosopher, *Creative Hub* in Imperial Script, the tagline, and the index I–XIII |
| Chapters | 13 product areas, each over a painted 3D scene | the 13 areas of the profile: Solutions, Gifts, Packaging, Uniform, Production, Giveaways, POS, Identity, Campaigns, 3D, Outdoor, Events, Photography; then the partners and the contact |
| Scenes | painted 3D figures, animated by the scroll (Theatre.js timelines) | the same scenes and timelines, **rebranded**: turquoise instead of pink and violet, the **R** mark on caps, laptops and cards, *RAPHAEL STUDIOS* on the skateboard, the box, the shop wall, the billboard; Raphael's *School of Athens* on the decks; two chapters are Raphael's own paintings (Castiglione's portrait for Photography, the *School of Athens* for the Partners) |
| Transitions | one painting burns into the next along a glowing edge; paper tears in over it | the same shader effects, in the paper colour of the site |
| Accent | Shopify green | Raphael turquoise `#19b5a8`, deep `#0c6e66` |

The engine (`src/scripts/stage/`) re-implements the reference's behaviour; the scenes' files come from the reference and
are converted and repainted by `tools/scenes/` (the edits are listed in `tools/scenes/rebrand.py`).

## Version 3: the studio's own scenes, and a new way to show the work

v3 keeps the technique and makes everything the eye reads the studio's own.

| | v2 | v3 |
| --- | --- | --- |
| Intro | the reference's golden-section drawing | the studio's own construction: the frame's thirds and diagonals, an eight-pointed star of Cairo's geometry, compass arcs, the construction of the R |
| People | the reference's figures, recoloured | new faces and hair, new clothes in the studio's palette (turquoise, saffron, terracotta, lapis, ivory, wine) |
| What they carry | the reference's objects in turquoise | the studio's products: its burgundy bag, its gift card, its enamel pins, its cap and tee, its catalogue of real work, its drawings, Raphael's *School of Athens* on the boards; the reference's logos taken out of the models |
| The animal | the cheetah | a bronze cat of old Egypt, a patina of turquoise in its hollows, a lapis cloth |
| Places | Italian gardens, lakes, arcades | Cairo and Egypt seen with Renaissance eyes: a garden of old Cairo, the Nile, Alexandria by moonlight, a Mamluk hall and courtyard, the pyramids under the stars, a lotus pond |
| The work | a strip of pictures and a list | a **statement** with the pictures set in its line (after Butter), **exhibits** (a studio inside an app window with its inspector), a **gallery** you drag and fling that stretches as it moves (after Agua), **what we do**: numbered services with a picture that follows the pointer and a large call to start a project (after Laco), the brands in two moving rows, a closing footer with the giant wordmark |

## Version 4: statues, and the work shown wide

The brief for v4: nobody should mistake the scenes for the reference's, the scenes should be the highest level and
the studio's alone, and the figures should become Greek statues (the studio's identity, merging with the Egyptian part).

| | v3 | v4 |
| --- | --- | --- |
| People | new faces and clothes, in colour | white marble statues in the manner of classical Greek sculpture, carved anew; the studio's products and turquoise accents stay in colour |
| The animal | a bronze cat | gone: a marble **Hermes**, the messenger, holds the studio's box over his head |
| The shop | the reference's terminal, skateboard, scanner, cables | the studio's gift box on the counter; its work framed on the wall |
| The creative · the 3D drawing | the reference's mask · headphones | a statue's face · a study drawing after the antique, curls where the headphones were |
| The painter's monitor | dark | the studio's retouching app at work, driven by the scroll |
| Photography · the founder | a still · a photograph in a card | two scenes of their own, from Raphael's paintings, raised in depth, moving with the scroll like the others |
| The work | a gallery with arrows; the paper inside a column | the paper takes the whole width; the work ribbon drags exactly like agua's slider (soft follow, the release's speed carried on and fading, endless, each photograph sliding inside its window); the Gifts chapter opens with agua's jar presentation made ours (a tumbler rises over the title, leans, turns and takes your brand); a closing **shelf** of every chapter whose cards fill with falling letters (agua's other products, with letters instead of fruit) |

## What came from the other inspirations

- **Agua**: the smooth scroll (Lenis); the work strips you drag sideways, which lean with the speed and coast to a stop.
- **Laco**: designing a shirt in 3D, which here became the atelier's sewn, physical T-shirt.
- **The original brief**: people cut out of their photos, who step forward out of the frame when you hover the card
  (or when it comes into view on a phone): the Uniform and Photography chapters and the founder's portrait.
- **Butter**: no assets or code from it are used.

## The studios: "see what it would be for you"

Each interactive piece performs one of the studio's services on the visitor's own brand, with the physics of the real
thing, and ends with the request for it (a WhatsApp message carrying the choices made):

| Chapter | The studio | What is real about it |
| --- | --- | --- |
| Uniform | a T-shirt sewn from a size-M pattern; dyed, screen printed or embroidered with your name or logo | cloth physics (XPBD) in a worker: weight, stretch, bending, seams, air; pull it anywhere |
| Packaging | a mailer box (24 × 17 × 7.5 cm) that folds itself from its die-cut sheet; kraft, black with gold foil, turquoise soft-touch, white gloss; printed inside, tissue and a seal | every panel turns on its crease with a little spring; the lid falls under gravity, rests leaning back (the crease resists bending against its score), lies on the table at its limit, snaps shut on a magnet |
| Giveaways | eleven giveaways (beach ball, football, bottle, tumbler, mug, cap, notebook, pen, tote, gift box, beach towel) rain onto the sand with your brand | a rigid-body world (spheres, capsules, boxes; friction, bounce, real weights): they roll, stack and settle; grab and throw them; shake the pile |
| 3D | a pop-up kiosk (2.4 × 1.6 m) split by a line you move: its technical drawing (hidden lines removed, dimensions in mm) and its render | one model, drawn twice in the same frame; your brand on its lightbox, header, counter and products |
| Events | an instant camera hands out the studio's event pictures as prints with your event's name | prints develop over seconds; each is a rigid card that turns to trail your finger and slides with the table's friction; with permission the camera takes you, and the print can be saved |
| Outdoor | your brand on the billboard in the chapter's painting | the painting's own billboard texture |

All of them load their code and 3D only when the reader comes near, start in short steps so scrolling stays smooth, and
draw nothing while nothing moves.
