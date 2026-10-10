# Credits and licences

## The reference

The technique of the page (the painted 3D scenes and the behaviour of the stage) and the scenes' geometry and animation
timelines come from Shopify's *Editions* page (Winter '26), used with the permission its creators gave the client. In
v3 the scenes are remade for Raphael Studios (`docs/REMAKE.md`): new faces, hair and clothes, the studio's own products,
a new animal, every backdrop painted anew, the reference's logos taken out (the bag in the armillary sphere and the
POS logo are removed from the models, the laptop's mark wiped). The intro's construction drawing, the presentation of
the work (statements, exhibits, gallery, services, footer) and the scenes' stills are the studio's own. The studio
lighting of the scenes is *Studio Small 09* from Poly Haven (CC0).

In v4 (`docs/REMAKE-V4.md`) every figure is carved anew as a marble statue, and the elements the reference was known
by are taken out or replaced: the cheetah (now a marble Hermes made for the studio), the skateboards, the payment
terminal (now the studio's gift box), its reader, scanner and cables, the sidekick's mask and eyelids, the headphones
of the 3D chapter. The Partners and Photography scenes use nothing from the reference: they are made from Raphael's
paintings and the founder's own photograph. Where a scene shows photographs (the catalogue in Solutions, the
painter's monitor in Identity, the framed work in POS), they are the studio's own work for its clients, as on the
rest of the site, and the same confirmation with each client applies (see below).

In v5 (`docs/REMAKE-V5.md`) the first scene is replaced by one made for the studio: its two marble figures, the night
and the holograms of Giza and Cairo are painted for it (by the models below), the bag is the studio's own and what
pours out of it is the studio's own work. The Partners hall is painted for the studio in the manner of the Orientalist
paintings of Karnak; the brands set in gold on its columns are the studio's references, as on the wall.

## Models used for the repainting

Run locally, on the studio's computer; their outputs are the studio's.

- Stable Diffusion XL 1.0 inpainting (`diffusers/stable-diffusion-xl-1.0-inpainting-0.1`), Stability AI and Hugging
  Face: CreativeML Open RAIL++-M licence.
- ControlNet canny for SDXL, small (`diffusers/controlnet-canny-sdxl-1.0-small`), Hugging Face: CreativeML Open RAIL++-M.
- SDXL VAE fp16 fix (`madebyollin/sdxl-vae-fp16-fix`): MIT.

## Paintings

- Raffaello Sanzio (Raphael), *The School of Athens*, 1509–1511, Apostolic Palace, Vatican: public domain.
- Raffaello Sanzio (Raphael), *Portrait of Baldassare Castiglione*, c. 1514–1515, Louvre: public domain.

## Photographs and logos

The photographs are the studio's own work for its clients, from its 2026 company profile; the brands' logos are shown
as the studio's references. Their use on the site is the studio's to confirm with each client (see `CONTENT.md`).

The showrooms' 3D models (`public/showroom/`) are replicas of that same work, made from its photographs: the polos,
the sweatshirt, the bags, the cooler, the blanket and the boxes, with the clients' names and logos printed on them as
the studio printed them. They fall under the same confirmation with each client; the content policy
(`src/content/policy.ts`) hides restricted work across the site.

## Fonts (SIL Open Font License 1.1, copies of the licences in `public/fonts/`)

- **Philosopher**, by Jovanny Lemonad: the wordmark, titles and display text.
- **Source Sans 3**, by Paul D. Hunt for Adobe: the body text.
- **Imperial Script**, by Robert Leuschke (TypeSETit): the script initials and *Creative Hub*.

## Software (MIT unless stated)

- [Astro](https://astro.build): the site's build.
- [three.js](https://threejs.org): the 3D, including `RoomEnvironment` (the studios' baked lighting), the glTF and KTX2
  loaders, the Basis Universal transcoder (Apache-2.0) and the meshopt decoder.
- [Lenis](https://lenis.darkroom.engineering): the smooth scroll.
- Building tools: glTF Transform, meshoptimizer, ktx2-encoder, Draco (Apache-2.0), Puppeteer (Apache-2.0), pngjs.
- Picture preparation (run locally, not shipped): Real-ESRGAN (BSD-3-Clause), BiRefNet (MIT), Depth Anything V2 Small
  (Apache-2.0; also the depth of the Partners and Photography scenes).

The physics of the shirt (cloth), the box (creases and lid) and the giveaways (rigid bodies) are the project's own,
after Müller et al., *Detailed Rigid Body Simulation with Extended Position Based Dynamics* (2020) and Macklin et al.,
*XPBD* (2016).
