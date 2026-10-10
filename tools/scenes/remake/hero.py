"""Hero: the two flying figures, dressed anew.

  * her robe: cream silk -> turquoise silk (Raphael's colour), the gold sash and the skin as they were;
  * his cape: red velvet -> saffron velvet, the white shirt and trousers stay ivory, the black doublet deep indigo;
  * their heads (Hero_fg_Heads): new faces and hair, painted in place (see paint_heads);
  * the backdrop: a garden of old Cairo (backdrops.py).
"""
from PIL import Image, ImageDraw, ImageFont

from paint import (ROOT, Painter, Tex, before_after, feather, gradient_map, greyish, grow, hue_window, lab, np, rect,
                   smooth, solid)

PACKED = 'EW26_Hero_251207v3_compressed-optimized_0_Hero_Packed_Texture.psd'
HEADS = 'EW26_Hero_251207v3_compressed-optimized_1_Hero_fg_Heads'

TURQUOISE_SILK = [(0.0, '#04201e'), (0.3, '#0e4e48'), (0.6, '#1d8178'), (0.82, '#4ea89e'), (0.95, '#b2dcd4'), (1.0, '#e8f6f2')]
SAFFRON_VELVET = [(0.0, '#2a1204'), (0.3, '#7a4508'), (0.6, '#c98a1c'), (0.85, '#ecc062'), (1.0, '#fff1c8')]
INDIGO = [(0.0, '#05070f'), (0.5, '#1a2140'), (1.0, '#56628f')]
BURGUNDY_PAPER = [(0.0, '#120204'), (0.5, '#3d0a10'), (0.85, '#5e121a'), (1.0, '#7a1c25')]  # Raphael's own bag
TUMBLER = [(0.0, '#031f1c'), (0.4, '#0b5e56'), (0.75, '#1f9a8e'), (1.0, '#a9e3da')]
IVORY_LID = [(0.0, '#3a352c'), (0.5, '#b9b09c'), (1.0, '#f7f2e6')]
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'
BAG = (1020, 1020, 1536, 1726)  # both bags' panels (and the hot pink seam v2 left at their edges)
BAG_FRONTS = [(1027, 1290, 1280, 1545), (1283, 1029, 1532, 1250)]
CUP = (1030, 1730, 1527, 2041)
DECK = (0, 1536, 1024, 1792)  # the board's printed underside (its print runs backwards: mirrored)


def robes():
    t = Tex('hero', PACKED)
    her = rect(t, (0, 0, 1024, 1024))
    L = lab(t.rgb)
    not_skin = np.clip((9 - L[..., 1]) / 4 + 0.5, 0, 1).astype(np.float32)  # skin is redder (a* > 12) than the creams
    silk = smooth(greyish(t, cmax=30, soft=8, lmin=22) * not_skin * her, t.rgb, r=4)
    gradient_map(t, silk, TURQUOISE_SILK, keep=0.1, keep_l=0.12, gamma=1.6)

    his = rect(t, (1024, 0, 2048, 1024))
    red = smooth(hue_window(t, 340, 28, smin=0.22, soft=14) * his, t.rgb, r=4)
    gradient_map(t, red, SAFFRON_VELVET, keep=0.1, keep_l=0.3)
    L = lab(t.rgb)
    dark = np.clip((24 - L[..., 0]) / 8 + 0.5, 0, 1).astype(np.float32) * his * (1 - red)
    gradient_map(t, smooth(dark, t.rgb, r=3), INDIGO, keep=0.05, keep_l=0.5, lo=1, hi=99)
    props(t)
    t.save()
    print(' ', before_after(t))


def seal(size: int) -> Image.Image:
    """a gold seal for the bag: a ring, a laurel of dots and a rosette (the same whichever way the panel runs)"""
    s = 4
    S = size * s
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c, r = S / 2, S * 0.42
    gold = (226, 190, 110, 255)
    d.ellipse((c - r, c - r, c + r, c + r), outline=gold, width=int(S * 0.035))
    d.ellipse((c - r * 0.78, c - r * 0.78, c + r * 0.78, c + r * 0.78), outline=gold, width=int(S * 0.015))
    for k in range(24):
        a = k * np.pi / 12
        x, y = c + r * 0.9 * np.cos(a), c + r * 0.9 * np.sin(a)
        d.ellipse((x - S * 0.012, y - S * 0.012, x + S * 0.012, y + S * 0.012), fill=gold)
    for k in range(8):  # the rosette
        a = k * np.pi / 4
        pts = [(c, c), (c + r * 0.55 * np.cos(a - 0.22), c + r * 0.55 * np.sin(a - 0.22)), (c + r * 0.66 * np.cos(a), c + r * 0.66 * np.sin(a)),
               (c + r * 0.55 * np.cos(a + 0.22), c + r * 0.55 * np.sin(a + 0.22))]
        d.polygon(pts, fill=gold)
    d.ellipse((c - r * 0.12, c - r * 0.12, c + r * 0.12, c + r * 0.12), fill=(122, 26, 34, 255))
    return im.resize((size, size), Image.LANCZOS)


def props(t: Tex):
    """the things they carry, the studio's: his bag in Raphael's own burgundy with a gold seal, her cup a turquoise
    tumbler with an ivory lid, the board printed with Raphael's School of Athens"""
    bag = rect(t, BAG)
    gradient_map(t, bag, BURGUNDY_PAPER, keep=0.0, keep_l=0.15, gamma=1.3)
    for (x0, y0, x1, y1) in BAG_FRONTS:
        size = int(min(x1 - x0, y1 - y0) * 0.62)
        a = np.asarray(seal(size)).astype(np.float32) / 255
        cx, cy = (x0 + x1) // 2 - size // 2, (y0 + y1) // 2 - size // 2
        m = a[..., 3:]
        t.rgb[cy:cy + size, cx:cx + size] = t.rgb[cy:cy + size, cx:cx + size] * (1 - m) + a[..., :3] * m
    x0, y0, x1, y1 = CUP
    lid = rect(t, (x0, y0, 1270, y1))
    gradient_map(t, rect(t, CUP) * (1 - lid), TUMBLER, keep=0.0, keep_l=0.35)
    gradient_map(t, lid, IVORY_LID, keep=0.0, keep_l=0.4)
    # the board: The School of Athens across it, the name on a band; the wood's light kept under the print
    x0, y0, x1, y1 = DECK
    w, h = x1 - x0, y1 - y0
    school = Image.open(ROOT / 'src' / 'assets' / 'media' / 'school-of-athens.jpg').convert('RGB')
    sw, sh = school.size
    art = school.crop((int(sw * 0.1), int(sh * 0.3), int(sw * 0.9), int(sh * 0.3 + sw * 0.8 * h / w))).resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(art)
    d.rectangle((0, int(h * 0.74), w, int(h * 0.94)), fill=(12, 110, 102))
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(h * 0.15))
    d.text((w / 2, h * 0.84), 'R A P H A E L   S T U D I O S', font=f, fill=(247, 245, 238), anchor='mm')
    art = np.asarray(art.transpose(Image.FLIP_LEFT_RIGHT)).astype(np.float32) / 255
    L = lab(t.rgb[y0:y1, x0:x1])[..., 0]
    import cv2
    lit = np.clip(cv2.GaussianBlur(L, (0, 0), 20) / max(np.percentile(L, 70), 1), 0.7, 1.12)[..., None]
    t.rgb[y0:y1, x0:x1] = np.clip(art * lit, 0, 1)


def heads(p: Painter):
    """their two heads (one packed upside down), painted anew: new faces and hair, the same pose and light"""
    t = Tex('hero', HEADS)
    a = solid(t, 0.3)
    her = grow(a * rect(t, (0, 0, 560, 512)), 2)
    p.paint(t, feather(her, 3), 'profile portrait of a young Egyptian woman with long black curly hair flowing in the wind, '
            'a thin gold circlet in her hair, olive skin, dark eyes, serene', strength=0.62, control=0.5, seed=31, tag='her')
    him = grow(a * rect(t, (540, 0, 1024, 512)), 2)
    p.paint(t, feather(him, 3), 'portrait of a young Nubian man with short black curly hair, dark brown skin, strong jaw, '
            'looking ahead, calm', strength=0.55, control=0.55, seed=32, rot=2, tag='him')
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    import sys
    robes()
    if '--no-paint' not in sys.argv:
        heads(Painter())
