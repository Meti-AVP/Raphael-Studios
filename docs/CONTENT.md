# Content

Everything on the site comes from the studio's 2026 company profile (`D:\RAhpel\Raphael Studios Content`: the PDF and
its linked Photoshop files), which is only ever read, never changed.

## Texts

| Where | What |
| --- | --- |
| `src/content/site.ts` | the studio: name, tagline, founding year, contact (phone, WhatsApp, e-mail, office, address, map link), the services, the brands, the profile's texts per service, the approach in the founder's words |
| `src/content/edition.ts` | the edition: the 13 chapters in order, with for each its numeral, its name in the index, its full name, the line under its title, its painted scene, its features (title, label, text, pictures, interactive piece), its work strip and its services |
| the studio components (`src/components/*Studio.astro`) | the choices offered in each interactive piece (fabrics, inks, finishes, colours, the camera's prints and their captions) |
| `src/scripts/modules/*.ts` | the WhatsApp message each piece writes (the number itself comes from `site.ts`) |

Headlines that are not in the profile (the chapters' one-line leads, the feature titles such as *Open it like a
present*, *Summer, branded*, *Drawn, then rendered*, *Everyone takes a picture home*) are proposals and need the client's
approval.

## Pictures

`py tools/content/build_media.py` prepares every picture from the profile (the list, with crops and flags, is
`tools/content/media.json`), into `src/assets/media/`, and writes `src/content/media.generated.json`:

- the picture, upscaled when the profile's copy is small (Real-ESRGAN), in sRGB;
- for people and products marked `cut`: the subject on transparency and the background with the subject painted out
  (BiRefNet); these are the photos whose people step out of the frame;
- for the 3D chapter: line drawings of the renders (the "drawn" side when 3D cannot run).

The models run on the computer and nothing leaves it (`tools/content/ai.py` says where their weights go). At build
time Astro makes AVIF and WebP copies at several widths, and each picture is loaded at the size its place needs.

The brands' logos (`py tools/content/build_logos.py`) are one-colour masks, so the same file shows grey on the wall and
turquoise on hover.

## The painted scenes

`tools/scenes/config.mjs` lists the 13 scenes, the reference files each one uses (and the parts taken out of them);
`npm run scenes` converts the models and textures. A texture remade for v3 (`art/scenes/<scene>/`, made by the scripts of
`tools/scenes/remake/`, see `REMAKE.md`) replaces the reference's; the others keep v2's edits (`tools/scenes/rebrand.py`).
The stills (shown on phones and while the 3D loads) are taken from the remade 3D itself:
`node tools/scenes/posters.mjs` with `npm run dev` running; the build copies them from `art/posters/`.

The scenes show the studio's own products and work: its bag, its gift card, its pins, its cap and tee, its catalogue
(pictures from `src/assets/media/`, only those `policy.ts` allows), its drawings, and Raphael's *School of Athens* on its
boards. No client's logo appears in a scene except as part of the studio's own photographed work in the catalogue and on
the rider's phone (an embroidery the studio made).

## What the client should still send

- the original, full-size photographs (several pictures in the profile are small and were upscaled);
- approval of the new headlines and the chapters' leads;
- the clients' logos as vector files, and confirmation that each brand may be shown;
- a studio e-mail address to publish instead of the Gmail one;
- the social media links;
- an Arabic version of the texts, if the site should have one.
