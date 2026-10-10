"""Customized solutions: the scholar in her study, dressed anew, and the studio's own products around her.

  * her robe: burgundy velvet -> deep turquoise velvet; her face and hair painted anew (dark hair, a turquoise veil);
  * the products on the floating cards (props()): the cap's emblem -> the R embroidered in gold, the tee's label
    wiped and its roses turned gold, the deck printed with Raphael's School of Athens, the sneakers' maker label ->
    the R, their camouflage in the studio's colours;
  * the catalogue on the lectern (catalogue()): its pages show the studio's own work instead of a skate shop's;
  * the view through the window: an old Cairo lane (backdrops.py).
"""
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps

from paint import (ROOT, Painter, Tex, before_after, ellipse_mask, feather, gradient_map, lab, np, poly, rect, smooth)
from policy import visible

ROOM = 'Agentic_fg_251209_compressed-optimized_0_Agentic_fg_251207'
PROPS = 'EW26_Agentic_Props_251209v5_compressed-optimized_1_Agentic_Props_251208'
BOOK = 'Rigged_Book_CS_Animated_V5_compressed-optimized_0_Agentic_book_Catalogue2'
MEDIA = ROOT / 'src' / 'assets' / 'media'
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'
TEAL_VELVET = [(0.0, '#010807'), (0.35, '#04302b'), (0.65, '#0d5c54'), (0.88, '#2c8d82'), (1.0, '#86cdc2')]

# the robe's outline, traced on a crop of the room (x 550 + cx * 1.25, y 150 + cy * 1.25)
_ROBE = [(128, 262), (160, 238), (178, 236), (262, 236), (270, 240), (300, 256), (330, 290), (350, 330), (366, 370),
         (386, 408), (418, 440), (440, 470), (460, 520), (482, 560), (502, 600), (522, 640), (540, 668), (548, 690),
         (520, 702), (470, 716), (420, 740), (380, 750), (330, 746), (296, 736), (276, 718), (272, 690), (282, 640),
         (292, 585), (286, 540), (270, 500), (240, 470), (200, 462), (160, 470), (130, 455), (112, 420), (108, 360),
         (114, 300)]
ROBE = [(int(550 + x * 1.25), int(150 + y * 1.25)) for x, y in _ROBE]
HEAD = ((835, 330), (70, 105))  # her head (face and hair), texture pixels

# the catalogue's six pages (texture pixels of the 512 x 512 book), and the studio's work to print on them
PAGES = [(1, 0, 171, 227), (172, 0, 341, 227), (342, 0, 513, 227), (1, 228, 169, 455), (171, 229, 341, 455),
         (342, 229, 512, 455)]
WORK = ['embroidery-caps', 'bonjour-totes', 'packaging-stack', 'clear-bag', 'total-polos', 'trevi-box',
        'duffle-star', 'ev-gift-box', 'neck-labels', 'riding-jacket', 'backgammon', 'star-waistbag',
        'football-bags', 'glass-r', 'crystal-uniform', 'sunny-cooler', 'trevi-blanket', 'rivoli-packs',
        'raphael-bag', 'ucl-ball', 'packaging-mass', 'egypt-flowers', 'robot-suit', 'caf-ball',
        'promo-collage', 'embroidery-laurel', 'doctor-clean', 'aura-colors', 'total-caf', 'womens-day',
        'ev-photo-card', 'marie-louis-2', 'winter-street', 'superheroes', 'promoters', 'cover-cairo']


def robe(t: Tex):
    L = lab(t.rgb)
    velvet = ((L[..., 0] < 45) & (np.hypot(L[..., 1], L[..., 2]) > 4)).astype(np.float32)
    m = smooth(velvet * feather(poly(t, ROBE), 2), t.rgb, r=3)
    gradient_map(t, m, TEAL_VELVET, keep=0.05, keep_l=0.4, lo=1, hi=99.5)


def remake(paint=True):
    t = Tex('solutions', ROOM)
    robe(t)
    if paint:
        p = Painter()
        p.paint(t, feather(ellipse_mask(t, *HEAD), 4), 'portrait of a young woman with dark hair covered by a sheer '
                'turquoise silk veil, dark eyes, olive skin, serene, seated in a dark study', strength=0.55, control=0.6,
                seed=3, tag='head')
    t.save()
    print(' ', before_after(t))


# ------------------------------------------------------------------------------------------------ the products

def work_photo(media_id: str, size) -> Image.Image:
    files = list(MEDIA.glob(f'{media_id}.jpg')) or list(MEDIA.glob(f'{media_id}.png'))
    return ImageOps.fit(Image.open(files[0]).convert('RGB'), size, Image.LANCZOS)


def catalogue():
    """the book's pages: the studio's own work, six to a page, as in a printed catalogue"""
    t = Tex('solutions', BOOK)
    work = [w for w in WORK if visible(w)]
    k = 0
    s = 3
    for (x0, y0, x1, y1) in PAGES:
        x1, y1 = min(x1, t.w), min(y1, t.h)
        w, h = x1 - x0, y1 - y0
        page = Image.new('RGB', (w * s, h * s), (240, 237, 228))
        d = ImageDraw.Draw(page)
        mx, my = int(w * s * 0.08), int(h * s * 0.05)
        cw = (w * s - 3 * mx) // 2
        ch = (h * s - 4 * my) // 3
        for r in range(3):
            for c in range(2):
                bx, by = mx + c * (cw + mx), my + r * (ch + my)
                d.rectangle((bx - 3, by - 3, bx + cw + 3, by + ch + 3), outline=(206, 202, 192), width=2)
                page.paste(work_photo(work[k % len(work)], (cw, ch)), (bx, by))
                k += 1
        art = np.asarray(page.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
        # the page's own light (its curl and shade) kept under the new print
        L = lab(t.rgb[y0:y1, x0:x1])[..., 0]
        shade = np.clip(cv2.GaussianBlur(L, (0, 0), 6) / max(np.percentile(L, 90), 1), 0.6, 1.08)[..., None]
        t.rgb[y0:y1, x0:x1] = np.clip(art * shade, 0, 1)
    t.save()
    print(' ', before_after(t))


def emblem(size: int, colour=(214, 172, 74), thread=True) -> Image.Image:
    """the R, embroidered: satin stitches (fine diagonal ridges) in gold thread, in a little relief"""
    s = 4
    S = size * s
    g = Image.new('L', (S, S), 0)
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(S * 0.78))
    ImageDraw.Draw(g).text((S / 2, S / 2), 'R', font=f, fill=255, anchor='mm')
    a = np.asarray(g).astype(np.float32) / 255
    yy, xx = np.mgrid[0:S, 0:S]
    stitch = (0.82 + 0.18 * np.sin((xx + yy) * (np.pi * 2 / (S * 0.035)))) if thread else np.ones_like(a)
    gy, gx = np.gradient(cv2.GaussianBlur(a, (0, 0), S * 0.012))
    lit = np.clip(1 + (gx + gy) * S * 0.02, 0.6, 1.3)
    rgb = np.array(colour, np.float32)[None, None] / 255 * (stitch * lit)[..., None]
    out = np.dstack([np.clip(rgb, 0, 1), a])
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)


def put(t: Tex, im: Image.Image, x: int, y: int):
    a = np.asarray(im).astype(np.float32) / 255
    h, w = a.shape[:2]
    m = a[..., 3:]
    t.rgb[y:y + h, x:x + w] = t.rgb[y:y + h, x:x + w] * (1 - m) + a[..., :3] * m


def wipe(t: Tex, box, radius=7):
    """removes what is in box (a label, an emblem) by filling it from around it"""
    x0, y0, x1, y1 = box
    rgb8 = (np.clip(t.rgb, 0, 1) * 255).astype(np.uint8)
    hole = np.zeros(rgb8.shape[:2], np.uint8)
    hole[y0:y1, x0:x1] = 255
    t.rgb = cv2.inpaint(rgb8, hole, radius, cv2.INPAINT_TELEA).astype(np.float32) / 255


def props():
    """the products on the floating cards: the cap, the tee, the deck and the sneakers, made the studio's"""
    t = Tex('solutions', PROPS)
    # the cap: its flower emblem -> the R embroidered in gold
    wipe(t, (100, 262, 182, 350))
    put(t, emblem(78), 102, 268)
    # the tee: the neck label's lettering wiped; the roses on its sleeves embroidered in gold and ivory instead
    wipe(t, (760, 58, 800, 78), 4)
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    pinkish = ((ang > -30) & (ang < 60) & (np.hypot(L[..., 1], L[..., 2]) > 10)).astype(np.float32) * rect(t, (516, 200, 1020, 508))
    gradient_map(t, smooth(pinkish, t.rgb, r=2), [(0.0, '#2b1b06'), (0.5, '#a57a2c'), (0.85, '#e8cf8e'), (1.0, '#fbf1d4')],
                 keep=0.05, keep_l=0.4)
    # the deck: Raphael's own painting (The School of Athens) and the name, instead of its print
    school = Image.open(MEDIA / 'school-of-athens.jpg').convert('RGB')
    x0, y0, x1, y1 = 0, 770, 512, 896
    w, h = x1 - x0, y1 - y0
    sw, sh = school.size
    art = school.crop((int(sw * 0.18), int(sh * 0.32), int(sw * 0.82), int(sh * 0.32 + sw * 0.64 * h / w))).resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(art)
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(h * 0.2))
    d.text((w * 0.5, h * 0.84), 'RAPHAEL STUDIOS', font=f, fill=(247, 245, 238), anchor='mm')
    art = art.transpose(Image.FLIP_LEFT_RIGHT)  # the deck's print runs backwards, as on the hero's board
    m = Image.new('L', (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=h * 2, fill=255)
    m = np.asarray(m.resize((w, h), Image.LANCZOS)).astype(np.float32)[..., None] / 255
    a = np.asarray(art).astype(np.float32) / 255
    t.rgb[y0:y1, x0:x1] = t.rgb[y0:y1, x0:x1] * (1 - m) + a * m
    # the sneakers: the tongue's maker label -> the R on ivory; the camouflage in the studio's colours
    wipe(t, (812, 664, 896, 736), 6)
    label = Image.new('RGBA', (70, 56), (238, 234, 222, 255))
    label.alpha_composite(emblem(44, (12, 110, 102), thread=False), (13, 6))
    put(t, label, 819, 672)
    L = lab(t.rgb)
    camo = ((np.hypot(L[..., 1], L[..., 2]) > 9) & (L[..., 0] < 75)).astype(np.float32) * rect(t, (640, 520, 1021, 860))
    gradient_map(t, smooth(camo, t.rgb, r=2), [(0.0, '#06231f'), (0.4, '#0f5c55'), (0.7, '#3a9a8e'), (1.0, '#d9c99a')],
                 keep=0.25, keep_l=0.4)
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    import sys
    remake(paint='--no-paint' not in sys.argv)
    props()
    catalogue()
