"""Rebrands the reference scenes' textures for Raphael Studios.

    py tools/scenes/rebrand.py <scene> <texture name> <in.png> <out.png>

Called by tools/scenes/build.mjs for every texture it decodes. A texture with an edit below is written to <out.png>;
a texture without one is left alone (nothing is written and the build keeps the original).

What changes, everywhere:
  * the reference's accent colours (hot pink, violet) become Raphael turquoise, keeping the painted light and folds;
  * its logos and brand names become Raphael's R (the wordmark's letter, Philosopher Bold) and the wordmark;
  * screens, labels, the catalogue and the easel show Raphael Studios: its name, its colours, its work.
Regions are in texture pixels; tools/scenes/uvmap.mjs prints where each mesh sits in its texture.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
FONTS = Path(os.environ.get('RAPHAEL_FONTS', 'D:/RAhpel/.work-raphael/fonts/src'))
MEDIA = ROOT / 'src' / 'assets' / 'media'

TURQ = (0x19, 0xB5, 0xA8)
TURQ_DEEP = (0x0C, 0x6E, 0x66)
TURQ_BRIGHT = (0x3E, 0xE0, 0xD1)
INK = (0x28, 0x28, 0x1C)
PAPER = (0xF7, 0xF5, 0xEE)

Box = tuple[int, int, int, int]  # x0, y0, x1, y1


def font(size: int, weight: str = 'Bold') -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / f'Philosopher-{weight}.ttf'), size)


# ----------------------------------------------------------------------------------------------- colour helpers

def rgb_to_hsv(a: np.ndarray) -> np.ndarray:
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
    d = mx - mn
    m = d > 1e-6
    safe = np.where(m, d, 1)
    rc, gc, bc = (mx - r) / safe, (mx - g) / safe, (mx - b) / safe
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2.0 + rc - bc, 4.0 + gc - rc))
    h = np.where(m, (h / 6.0) % 1.0, 0)
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(a: np.ndarray) -> np.ndarray:
    h, s, v = a[..., 0], a[..., 1], a[..., 2]
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    i = i.astype(int) % 6
    return np.stack([np.choose(i, [v, q, p, p, t, v]), np.choose(i, [t, v, v, q, p, p]), np.choose(i, [p, p, t, v, v, q])], -1)


def to_arr(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert('RGBA')).astype(np.float32) / 255.0


def to_img(a: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def recolour(img: Image.Image, box: Box | None, lo: float, hi: float, to=TURQ, min_sat=0.35, min_val=0.12,
             light=1.0) -> Image.Image:
    """Moves the hues between lo and hi (0..1, may wrap past 1) inside box to the target colour, keeping each
    pixel's relative lightness so the painted folds, highlights and shadows survive. Soft at the range's edges."""
    a = to_arr(img)
    x0, y0, x1, y1 = box or (0, 0, a.shape[1], a.shape[0])
    sub = a[y0:y1, x0:x1, :3]
    hsv = rgb_to_hsv(sub)
    h = hsv[..., 0]
    if hi > 1:
        h = np.where(h < hi - 1, h + 1, h)
    edge = 0.025
    m = np.clip((h - lo) / edge, 0, 1) * np.clip((hi - h) / edge, 0, 1)
    m *= np.clip((hsv[..., 1] - min_sat) / 0.12, 0, 1) * np.clip((hsv[..., 2] - min_val) / 0.08, 0, 1)
    th = rgb_to_hsv(np.array(to, np.float32)[None, None, :] / 255.0)[0, 0]
    new = hsv.copy()
    new[..., 0] = th[0]
    new[..., 1] = np.clip(th[1] * (0.55 + 0.45 * hsv[..., 1]), 0, 1)
    # the brightest source pixels map to the target's value; scale the rest with them
    vmax = np.percentile(hsv[..., 2][m > 0.5], 98) if (m > 0.5).any() else 1.0
    new[..., 2] = np.clip(hsv[..., 2] / max(vmax, 1e-3) * th[2] * light * 1.12, 0, 1)
    out = hsv_to_rgb(new)
    a[y0:y1, x0:x1, :3] = sub * (1 - m[..., None]) + out * m[..., None]
    return to_img(a)


def shading(img: Image.Image, box: Box, blur: float = 6) -> np.ndarray:
    """The light and shadow of a painted region (its luminance, normalised to a 0.5 mid-grey), to lay over new art.
    A large blur keeps only the broad light (for new content: no ghost of the old one)."""
    a = to_arr(img.crop(box))[..., :3]
    lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
    lum = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255
    return lum / max(np.median(lum), 1e-3) * 0.5


def place(img: Image.Image, art: Image.Image, box: Box, shade: bool = True, strength: float = 0.85, blur: float = 6) -> Image.Image:
    """Puts art into box (resized to fit), lit by the original region's shading (so folds and curvature stay)."""
    out = img.convert('RGBA').copy()
    w, h = box[2] - box[0], box[3] - box[1]
    a = to_arr(art.convert('RGBA').resize((w, h), Image.LANCZOS))
    if shade:
        s = shading(img, box, blur)[..., None]
        light = 1 + (s * 2 - 1) * strength
        a[..., :3] = np.clip(a[..., :3] * light, 0, 1)
    base = to_arr(out.crop(box))
    alpha = a[..., 3:4]
    base[..., :3] = base[..., :3] * (1 - alpha) + a[..., :3] * alpha
    out.paste(to_img(base), box[:2])
    return out


def r_mark(size: int, colour=PAPER, bg=None, pad=0.18) -> Image.Image:
    """The R of the wordmark (Philosopher Bold) on a transparent (or coloured) square."""
    im = Image.new('RGBA', (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(int(size * (1 - pad * 2) * 1.05))
    bb = d.textbbox((0, 0), 'R', font=f)
    d.text(((size - (bb[2] - bb[0])) / 2 - bb[0], (size - (bb[3] - bb[1])) / 2 - bb[1]), 'R', font=f, fill=colour + (255,))
    return im


def wordmark(width: int, height: int, colour=PAPER, bg=None, lines=('RAPHAEL', 'STUDIOS'), weight='Bold',
             tracking=0.08) -> Image.Image:
    im = Image.new('RGBA', (width, height), bg + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    size = height // (len(lines) + 1)
    for _ in range(40):
        f = font(size, weight)
        widths = [sum(d.textlength(c, font=f) for c in ln) + tracking * size * (len(ln) - 1) for ln in lines]
        if max(widths) <= width * 0.9 and size * len(lines) * 1.15 <= height * 0.9:
            break
        size = int(size * 0.94)
    f = font(size, weight)
    total = size * 1.15 * len(lines)
    y = (height - total) / 2
    for ln in lines:
        w = sum(d.textlength(c, font=f) for c in ln) + tracking * size * (len(ln) - 1)
        x = (width - w) / 2
        for c in ln:
            d.text((x, y), c, font=f, fill=colour + (255,))
            x += d.textlength(c, font=f) + tracking * size
        y += size * 1.15
    return im


def inpaint(img: Image.Image, box: Box) -> Image.Image:
    """Removes what is in box (a logo, a label's text) by filling it from its surroundings."""
    import cv2
    a = np.asarray(img.convert('RGB'))
    mask = np.zeros(a.shape[:2], np.uint8)
    mask[box[1]:box[3], box[0]:box[2]] = 255
    out = cv2.inpaint(a, mask, 9, cv2.INPAINT_TELEA)
    res = Image.fromarray(out).convert('RGBA')
    res.putalpha(img.convert('RGBA').getchannel('A'))
    return res


def photo(media_id: str, size: tuple[int, int], focus=(0.5, 0.5)) -> Image.Image:
    """A prepared work photo, cover-cropped to size."""
    files = list(MEDIA.glob(f'{media_id}.jpg')) or list(MEDIA.glob(f'{media_id}.png'))
    im = Image.open(files[0]).convert('RGB')
    return ImageOps.fit(im, size, Image.LANCZOS, centering=focus).convert('RGBA')


# ----------------------------------------------------------------------------------------------- the edits

PINK = (0.80, 1.0)    # the reference's hot pink and magenta
VIOLET = (0.64, 0.84)  # its violet and purple


def hero_packed(img: Image.Image) -> Image.Image:
    img = recolour(img, (1027, 1029, 1533, 1721), *PINK, min_sat=0.35)   # the two shopping bags
    img = recolour(img, (1030, 1730, 1528, 2042), *PINK, min_sat=0.3)    # the cup's sleeve
    img = recolour(img, (0, 1026, 1025, 2047), *PINK, min_sat=0.3)       # the skateboard: wheels and the graffiti
    # the deck's graffiti (its underside, a band across the skateboard region) becomes the wordmark
    band = (0, 1536, 1024, 1792)
    w, h = band[2] - band[0], band[3] - band[1]
    rng = np.random.default_rng(7)
    grain = (rng.normal(0, 5, (h, w, 1)) + np.array([236, 233, 224])).clip(0, 255).astype(np.uint8)
    clean = Image.fromarray(grain, 'RGB').convert('RGBA')
    # the deck's UVs run backwards along its length: mirrored here, the wordmark reads the right way on the board
    art = wordmark(w, h, TURQ_DEEP, lines=('RAPHAEL STUDIOS',), tracking=0.16).transpose(Image.FLIP_LEFT_RIGHT)
    clean.alpha_composite(art)
    return place(img, clean, band, strength=0.5, blur=40)


def checkout_fg(img: Image.Image) -> Image.Image:
    img = recolour(img, (761, 614, 1472, 1108), 0.90, 1.04, TURQ, min_sat=0.45)   # the beanie
    img = recolour(img, (1549, 671, 2048, 1368), 0.90, 1.04, TURQ, min_sat=0.35)  # the card
    # the beanie's woven label and its tag: Raphael's
    img = place(img, wordmark(88, 64, PAPER, bg=(22, 22, 20), lines=('RAPHAEL', 'STUDIOS'), tracking=0.08), (912, 772, 1004, 840), strength=0.45, blur=10)
    img = place(img, r_mark(64, PAPER, bg=(18, 18, 16), pad=0.2), (1170, 776, 1236, 844), strength=0.45, blur=10)
    return img


def shopapp_fg(img: Image.Image) -> Image.Image:
    img = recolour(img, (0, 0, 1300, 1530), *VIOLET, min_sat=0.3)   # the cap, the phone
    # the cap's logo: an embroidered R in place of the app's mark
    img = inpaint(img, (966, 86, 1072, 178))
    img = place(img, r_mark(96, PAPER, pad=0.06), (972, 84, 1068, 180), strength=0.45, blur=12)
    return img


def shipping_fg(img: Image.Image) -> Image.Image:
    # the box: from orange card to Raphael turquoise
    return recolour(img, (1818, 4, 1959, 566), 0.0, 0.13, TURQ, min_sat=0.3)


def shipping_label(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = 4  # draw large, then reduce: crisp small type
    im = Image.new('RGBA', (w * s, h * s), (246, 244, 238, 255))
    d = ImageDraw.Draw(im)
    d.rectangle((8, 8, w * s - 8, h * s - 8), outline=INK + (255,), width=6)
    im.alpha_composite(r_mark(64 * s // 2, INK), (16, 24))
    d.text((110, 34), 'Raphael Studios', font=font(52), fill=INK + (255,))
    d.text((110, 92), 'Creative Hub', font=font(34, 'Regular'), fill=INK + (255,))
    d.line((8, 170, w * s - 8, 170), fill=INK + (255,), width=5)
    d.text((26, 190), 'PACKAGING', font=font(78), fill=INK + (255,))
    for i, ln in enumerate(['4 Al Youssr St.', 'Dokki, Cairo, Egypt', '+20 122 333 2000']):
        d.text((28, 300 + i * 48), ln, font=font(40, 'Regular'), fill=INK + (255,))
    d.text((w * s - 200, 300), 'MMXI', font=font(48), fill=INK + (255,))
    d.line((8, 470, w * s - 8, 470), fill=INK + (255,), width=5)
    rnd = np.random.default_rng(2011)
    x = 30
    while x < w * s - 40:
        bw = int(rnd.integers(3, 12))
        d.rectangle((x, 500, x + bw, 880), fill=INK + (255,))
        x += bw + int(rnd.integers(4, 12))
    d.text((40, 900), 'RAPHAEL-STUDIOS.COM', font=font(40), fill=INK + (255,))
    return im.resize((w, h), Image.LANCZOS)


def sidekick_fg(img: Image.Image) -> Image.Image:
    # the mask and the velvet: Raphael's turquoise (deep in the shadows, bright in the light)
    img = recolour(img, None, *VIOLET, TURQ, min_sat=0.28)
    img = recolour(img, None, 0.78, 1.0, TURQ_DEEP, min_sat=0.22, light=1.25)
    # the laptop lid's logo: the R
    img = inpaint(img, (158, 1598, 252, 1682))
    return place(img, r_mark(84, (214, 214, 210), pad=0.1), (162, 1598, 250, 1682), strength=0.35, blur=14)


def agentic_props(img: Image.Image) -> Image.Image:
    img = recolour(img, (0, 0, 1024, 1024), *PINK, min_sat=0.3)
    return img


def b2b_fg(img: Image.Image) -> Image.Image:
    # the laptop lid's logo: the R, etched like the original
    img = inpaint(img, (188, 1160, 244, 1217))
    return place(img, r_mark(56, (226, 226, 222), pad=0.08), (190, 1161, 242, 1216), strength=0.35, blur=10)


def finance_phone(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = 6
    im = Image.new('RGBA', (w * s, h * s), PAPER + (255,))
    d = ImageDraw.Draw(im)
    card = Image.new('RGBA', (w * s - 60, 300), TURQ + (255,))
    ImageDraw.Draw(card).text((30, 24), 'Raphael Studios', font=font(54), fill=PAPER + (255,))
    ImageDraw.Draw(card).text((30, 210), 'GIVEAWAYS', font=font(44), fill=PAPER + (255,))
    im.alpha_composite(card, (30, 170))
    d.text((32, 500), 'This summer', font=font(50), fill=INK + (255,))
    for i, (a, b) in enumerate([('Tote bags', '1,200'), ('Bucket hats', '800'), ('Cooler bags', '600'), ('Beach towels', '900'), ('Backgammon', '150')]):
        y = 580 + i * 110
        d.text((32, y), a, font=font(42, 'Regular'), fill=INK + (255,))
        d.text((w * s - 200, y), b, font=font(42), fill=TURQ_DEEP + (255,))
        d.line((32, y + 80, w * s - 32, y + 80), fill=(200, 196, 186, 255), width=3)
    return im.resize((w, h), Image.LANCZOS)


def online_canvas(img: Image.Image) -> Image.Image:
    """The painter's canvas: an identity board for Raphael Studios instead of a shop's wireframe."""
    box = (296, 0, 1024, 716)
    w, h = box[2] - box[0], box[3] - box[1]
    s = 3
    board = Image.new('RGBA', (w * s, h * s), (246, 244, 238, 255))
    d = ImageDraw.Draw(board)
    grey = (150, 146, 136, 255)
    W, H = board.size
    d.ellipse((W * 0.08, H * 0.04, W * 0.92, H * 0.66), outline=grey, width=3)
    d.line((W * 0.5, 0, W * 0.5, H), fill=grey, width=2)
    d.line((0, H * 0.35, W, H * 0.35), fill=grey, width=2)
    mark = r_mark(int(W * 0.34), INK)
    board.alpha_composite(mark, (int(W * 0.33), int(H * 0.06)))
    wm = wordmark(int(W * 0.8), int(H * 0.14), INK, lines=('RAPHAEL STUDIOS',), tracking=0.14)
    board.alpha_composite(wm, (int(W * 0.1), int(H * 0.40)))
    for i, c in enumerate([TURQ, TURQ_DEEP, INK, (222, 218, 205)]):
        x = int(W * (0.1 + i * 0.205))
        d.rectangle((x, int(H * 0.62), x + int(W * 0.17), int(H * 0.74)), fill=c + (255,))
    d.text((int(W * 0.1), int(H * 0.79)), 'Aa', font=font(int(H * 0.11)), fill=INK + (255,))
    d.text((int(W * 0.34), int(H * 0.8)), 'Philosopher', font=font(int(H * 0.045)), fill=INK + (255,))
    d.text((int(W * 0.34), int(H * 0.86)), 'Bold · Regular · Italic', font=font(int(H * 0.035), 'Regular'), fill=grey)
    art = board.resize((w, h), Image.LANCZOS)
    return place(img, art, box, strength=0.9, blur=36)


def retail_ipad(img: Image.Image) -> Image.Image:
    w, h = img.size
    im = Image.new('RGBA', (w, h), (18, 20, 19, 255))
    left = photo('dosh-pos', (int(w * 0.62), h))
    im.alpha_composite(left, (0, 0))
    d = ImageDraw.Draw(im)
    x0 = int(w * 0.62)
    d.rectangle((x0, 0, w, h), fill=(246, 244, 238, 255))
    im.alpha_composite(r_mark(90, INK), (x0 + 30, 40))
    d.text((x0 + 30, 150), 'POS materials', font=font(40), fill=INK + (255,))
    for i, t in enumerate(['Retail displays', 'Signage', 'Wobblers', 'Shelf branding', 'Display stands']):
        d.text((x0 + 30, 240 + i * 62), t, font=font(30, 'Regular'), fill=INK + (255,))
        d.ellipse((w - 70, 250 + i * 62, w - 50, 270 + i * 62), fill=TURQ + (255,))
    d.rectangle((x0 + 30, h - 110, w - 30, h - 50), fill=TURQ + (255,))
    d.text((x0 + 50, h - 100), 'Raphael Studios', font=font(32), fill=PAPER + (255,))
    return im


ART = Path(os.environ.get('RAPHAEL_ART', 'D:/RAhpel/.work-raphael/art'))


def script_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / 'ImperialScript-Regular.ttf'), size)


def deck_mask(w: int, h: int) -> Image.Image:
    m = Image.new('L', (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=w * 2, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def vertical_text(w: int, h: int, text: str, colour, size_frac=0.62, weight='Bold', tracking=0.06) -> Image.Image:
    """Text set along the deck (rotated 90 degrees), filling its length."""
    L, S = h, w
    im = Image.new('RGBA', (L, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    size = int(S * size_frac)
    for _ in range(30):
        f = font(size, weight)
        tw = sum(d.textlength(c, font=f) for c in text) + tracking * size * (len(text) - 1)
        if tw <= L * 0.84:
            break
        size = int(size * 0.94)
    f = font(size, weight)
    tw = sum(d.textlength(c, font=f) for c in text) + tracking * size * (len(text) - 1)
    bb = d.textbbox((0, 0), 'H', font=f)
    x = (L - tw) / 2
    y = (S - (bb[3] - bb[1])) / 2 - bb[1]
    for c in text:
        d.text((x, y), c, font=f, fill=colour + (255,))
        x += d.textlength(c, font=f) + tracking * size
    return im.rotate(90, expand=True)


def deck_art(i: int, w: int, h: int, school: Image.Image) -> Image.Image:
    """Fourteen decks for the shop wall: Raphael's own painting (The School of Athens) in slices, and the studio's
    type in its colours."""
    designs = [
        ('paint', 0.10), ('type', 'RAPHAEL', PAPER, TURQ_DEEP), ('paint', 0.30), ('mark', TURQ, PAPER), ('paint', 0.47),
        ('type', 'STUDIOS', TURQ, INK), ('paint', 0.62),
        ('type', 'MMXI', INK, PAPER), ('paint', 0.20), ('script', 'Creative', PAPER, TURQ_DEEP), ('paint', 0.52),
        ('type', 'CAIRO', PAPER, INK), ('paint', 0.80), ('mark', PAPER, TURQ_DEEP),
    ]
    d = designs[i % len(designs)]
    if d[0] == 'paint':
        sw, sh = school.size
        cw = int(sh * w / h)
        x0 = int((sw - cw) * d[1])
        im = school.crop((x0, 0, x0 + cw, sh)).resize((w, h), Image.LANCZOS).convert('RGBA')
        draw = ImageDraw.Draw(im)
        f = font(max(10, w // 7))
        bb = draw.textbbox((0, 0), 'RAPHAEL', font=f)
        draw.text(((w - (bb[2] - bb[0])) / 2, h - h * 0.12), 'RAPHAEL', font=f, fill=PAPER + (255,))
        return im
    bg = d[2] if d[0] == 'mark' else (d[3] if len(d) > 3 else PAPER)
    im = Image.new('RGBA', (w, h), bg + (255,))
    if d[0] == 'type':
        im.alpha_composite(vertical_text(w, h, d[1], d[2]))
    elif d[0] == 'mark':
        m = r_mark(w, d[1], pad=0.12)
        im.alpha_composite(m, (0, (h - w) // 2))
        ImageDraw.Draw(im).ellipse((w * 0.08, (h - w) / 2 + w * 0.08 - w * 0.02, w * 0.92, (h + w) / 2 - w * 0.08 + w * 0.02), outline=d[1] + (255,), width=max(2, w // 40))
    elif d[0] == 'script':
        L, S = h, w
        t = Image.new('RGBA', (L, S), (0, 0, 0, 0))
        dd = ImageDraw.Draw(t)
        f = script_font(int(S * 0.9))
        tw = dd.textlength(d[1], font=f)
        bb = dd.textbbox((0, 0), d[1], font=f)
        dd.text(((L - tw) / 2, (S - (bb[3] - bb[1])) / 2 - bb[1]), d[1], font=f, fill=d[2] + (255,))
        im.alpha_composite(t.rotate(90, expand=True))
    return im


def retail_wall(img: Image.Image) -> Image.Image:
    img = recolour(img, None, *PINK, min_sat=0.3)
    school = Image.open(ART / 'school-of-athens.jpg').convert('RGB')
    out = img.convert('RGBA')
    cols = [255, 437, 615, 793, 970, 1146, 1325]
    rows = [(40, 431), (458, 849)]
    i = 0
    for (y0, y1) in rows:
        for cx in cols:
            box = (cx - 53, y0, cx + 53, y1)
            w, h = box[2] - box[0], box[3] - box[1]
            art = deck_art(i, w, h, school)
            i += 1
            # the wood's light and grain, kept under the new print
            lit = shading(out, box, blur=3)[..., None]
            a = to_arr(art)
            a[..., :3] = np.clip(a[..., :3] * (0.55 + 0.9 * lit), 0, 1)
            m = np.asarray(deck_mask(w, h)).astype(np.float32)[..., None] / 255.0
            base = to_arr(out.crop(box))
            base[..., :3] = base[..., :3] * (1 - m) + a[..., :3] * m
            out.paste(to_img(base), box[:2])
    return out


def billboard(w: int, h: int) -> Image.Image:
    """The outdoor chapter's billboard: a Raphael Studios poster on the hill. Its plane in the scene is nearly square
    (0.93 : 1), so the poster is drawn for that shape."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = np.clip(1 - np.hypot((xx - w * 0.72) / w, (yy - h * 0.28) / h) * 1.1, 0, 1)[..., None]
    base = np.array(TURQ_DEEP, np.float32) / 255 * (0.35 + 0.65 * g) + np.array([0.02, 0.03, 0.03]) * (1 - g)
    im = to_img(np.concatenate([base, np.ones((h, w, 1), np.float32)], -1))
    d = ImageDraw.Draw(im)
    im.alpha_composite(r_mark(int(w * 0.5), PAPER, pad=0.04), (int(w * 0.46), int(h * 0.06)))
    ImageDraw.Draw(im).ellipse((int(w * 0.44), int(h * 0.04), int(w * 0.44) + int(w * 0.54), int(h * 0.04) + int(w * 0.54)), outline=PAPER + (255,), width=6)
    d.text((int(w * 0.07), int(h * 0.5)), 'Raphael', font=font(int(w * 0.2)), fill=PAPER + (255,))
    d.text((int(w * 0.07), int(h * 0.68)), 'Studios', font=font(int(w * 0.2)), fill=PAPER + (255,))
    d.text((int(w * 0.075), int(h * 0.88)), 'An agency for what comes next', font=script_font(int(w * 0.07)), fill=TURQ_BRIGHT + (255,))
    # the billboard's plane shows a KTX2 still upside down (it was made for a video, which three.js flips)
    return im.transpose(Image.FLIP_TOP_BOTTOM)


GENERATORS = {('outdoor', 'billboard'): billboard}


def pos_pcb(img: Image.Image) -> Image.Image:
    img = inpaint(img, (170, 0, 340, 40))
    d = ImageDraw.Draw(img)
    d.text((182, 8), 'raphael studios', font=font(20, 'Regular'), fill=(200, 200, 200, 255))
    return img


def shopapp_screen(img: Image.Image) -> Image.Image:
    w, h = img.size
    return photo('embroidery-laurel', (w, h), (0.5, 0.45))


# posters (the still paintings): the same colour moves, by hue only (a still has no UV map)
def poster_pink(img: Image.Image) -> Image.Image:
    return recolour(img, None, *PINK, min_sat=0.55)


def poster_violet(img: Image.Image) -> Image.Image:
    img = recolour(img, None, 0.64, 0.80, TURQ, min_sat=0.35)
    return recolour(img, None, 0.80, 0.98, TURQ_DEEP, min_sat=0.35, light=1.25)


EDITS: list[tuple[str, str, callable]] = [
    # (scene, texture-name regex, edit)
    ('hero', r'Hero_Packed_Texture', hero_packed),
    ('hero', r'^poster-', poster_pink),
    ('gifts', r'Checkout_fg_diffuse', checkout_fg),
    ('gifts', r'^poster-', poster_pink),
    ('uniform', r'ShopApp_fg_diffuse', shopapp_fg),
    ('uniform', r'shopapp-muse', shopapp_screen),
    ('uniform', r'^poster-', poster_violet),
    ('packaging', r'Shipping_fg_Merged', shipping_fg),
    ('packaging', r'Shipping_fg_label', shipping_label),
    ('communication', r'Sidekick_fg_diffuse', sidekick_fg),
    ('communication', r'^poster-', poster_violet),
    ('solutions', r'Agentic_Props_', agentic_props),
    ('events', r'B2B_BaseColor', b2b_fg),
    ('giveaways', r'Finance_iPhone', finance_phone),
    ('identity', r'online_fg_diffuse', online_canvas),
    ('pos', r'POS Templates|POS_Templates', retail_ipad),
    ('pos', r'environment-wall', retail_wall),
    ('pos', r'Pos-PCB', pos_pcb),
    ('pos', r'^poster-', poster_pink),
]


def main() -> None:
    scene, name, src, dst = sys.argv[1:5]
    if name.startswith('generate:'):
        w, h = Image.open(src).size
        gen = GENERATORS[(scene, name.split(':', 1)[1])]
        gen(w, h).save(dst)
        print(f'{scene}: drew {name}')
        return
    fns = [fn for (sc, pat, fn) in EDITS if sc == scene and re.search(pat, name.split('#', 1)[-1] if '#' in name else name)]
    if not fns:
        return
    img = Image.open(src).convert('RGBA')
    for fn in fns:
        img = fn(img)
        print(f'{scene}: {name} <- {fn.__name__}')
    img.save(dst)


if __name__ == '__main__':
    main()
