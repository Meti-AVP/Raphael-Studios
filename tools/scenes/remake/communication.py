"""Creative design & brand communication: the masked creative at the laptop, dressed anew.

  * his sleeves: shot silk (turquoise and lilac) -> saffron gold; the black velvet and its gold work as they were;
  * the mask: Raphael's turquoise, now a Venetian mask with gold filigree; his face and hair painted anew (paint_head);
  * the vase on the shelf: a turquoise glaze, as in the potteries of Cairo;
  * the carving on the table: the cartouche holds the studio's R instead of a masked face (cartouche());
  * the night behind him: the stars over the pyramids of Giza (backdrops.py).
"""
import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from paint import (Painter, Tex, before_after, ellipse_mask, feather, gradient_map, grow, lab, np, poly, rect, smooth)

FG = 'EW26_Sidekick_251208_compressed-optimized_0_Sidekick_fg_diffuse_clean'
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'
SAFFRON_SILK = [(0.0, '#1c0c02'), (0.3, '#6a3a06'), (0.6, '#bd7f12'), (0.82, '#e8b544'), (0.95, '#f7dc90'), (1.0, '#fff3cf')]
TURQ_GLAZE = [(0.0, '#021c19'), (0.35, '#0a5a52'), (0.65, '#1c9a8e'), (0.88, '#62cfc2'), (1.0, '#d6f5f0')]
BODY = (440, 560, 1920, 1240)  # his doublet and sleeves, texture pixels
MASK = ((968, 345), (128, 72))  # the mask over his eyes
HEAD = ((1000, 330), (215, 235))  # head and hair
VASE = (1490, 60, 1700, 380)
CARTOUCHE = ((1180, 1500), (88, 100))  # the carved face in the table's cartouche
LID = (176, 1596, 304, 1724)  # the laptop lid's logo: wiped whole, then the R etched alone


def sleeves(t: Tex):
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    ch = np.hypot(L[..., 1], L[..., 2])
    teal = ((ang > 150) | (ang < -140)) & (ch > 12)  # turquoise sits around +-180 degrees
    lilac = ((ang > -70) & (ang < 25) & (ch > 7) & (L[..., 0] > 30))
    m = (teal | lilac).astype(np.float32) * rect(t, BODY)
    m = smooth(cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)), t.rgb, r=3)
    gradient_map(t, m, SAFFRON_SILK, keep=0.06, keep_l=0.35)


def vase(t: Tex):
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    ch = np.hypot(L[..., 1], L[..., 2])
    red = ((ang < 62) & (ang > -20) & (ch > 14)).astype(np.float32) * rect(t, VASE)
    gradient_map(t, smooth(red, t.rgb, r=2), TURQ_GLAZE, keep=0.04, keep_l=0.35)


def cartouche(t: Tex):
    """the masked face carved in the cartouche -> the R, carved in the same stone"""
    (cx, cy), (ax, ay) = CARTOUCHE
    inner = ellipse_mask(t, (cx, cy), (ax, ay))
    rgb8 = (np.clip(t.rgb, 0, 1) * 255).astype(np.uint8)
    # the stone without the face: filled from the stone around it, with the stone's own grain
    filled = cv2.inpaint(rgb8, (inner > 0).astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA).astype(np.float32) / 255
    x0, y0, x1, y1 = cx - ax - 20, cy - ay - 20, cx + ax + 20, cy + ay + 20
    stone = cv2.GaussianBlur(filled[y0:y1, x0:x1], (0, 0), 6)
    rng = np.random.default_rng(5)
    grain = cv2.GaussianBlur(rng.normal(0, 0.035, stone.shape[:2]).astype(np.float32), (0, 0), 0.8)[..., None]
    stone = np.clip(stone * (1 + grain), 0, 1)
    # the R, cut into the stone: its floor in shade, its upper left walls dark, its lower right walls lit
    s = 4
    W, H = (x1 - x0) * s, (y1 - y0) * s
    glyph = Image.new('L', (W, H), 0)
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(H * 0.58))
    ImageDraw.Draw(glyph).text((W / 2, H / 2 + H * 0.02), 'R', font=f, fill=255, anchor='mm')
    g = np.asarray(glyph.resize((x1 - x0, y1 - y0), Image.LANCZOS)).astype(np.float32) / 255
    gs = cv2.GaussianBlur(g, (0, 0), 1.6)
    gy, gx = np.gradient(gs)
    walls = np.clip(-(gx + gy) * 9, -1, 1)
    shade = 1 + 0.45 * walls[..., None] - 0.22 * g[..., None]
    carved = np.clip(stone * shade, 0, 1)
    m = feather(inner, 3)[y0:y1, x0:x1, None]
    t.rgb[y0:y1, x0:x1] = t.rgb[y0:y1, x0:x1] * (1 - m) + carved * m


def lid(t: Tex):
    """the lid's old logo (a shopping bag, still under v2's R) wiped from the aluminium, and the R etched alone"""
    x0, y0, x1, y1 = LID
    rgb8 = (np.clip(t.rgb, 0, 1) * 255).astype(np.uint8)
    hole = np.zeros(rgb8.shape[:2], np.uint8)
    hole[y0:y1, x0:x1] = 255
    filled = cv2.inpaint(rgb8, hole, 15, cv2.INPAINT_NS).astype(np.float32) / 255
    # the brushed metal's grain, taken from the lid beside it
    grain = t.rgb[y0:y1, x1 + 20:x1 + 20 + (x1 - x0)] - cv2.GaussianBlur(t.rgb[y0:y1, x1 + 20:x1 + 20 + (x1 - x0)], (0, 0), 2)
    metal = np.clip(cv2.GaussianBlur(filled[y0:y1, x0:x1], (0, 0), 6) + grain, 0, 1)
    s = 4
    W, H = (x1 - x0) * s, (y1 - y0) * s
    glyph = Image.new('L', (W, H), 0)
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(H * 0.5))
    ImageDraw.Draw(glyph).text((W / 2, H / 2), 'R', font=f, fill=255, anchor='mm')
    g = np.asarray(glyph.resize((x1 - x0, y1 - y0), Image.LANCZOS)).astype(np.float32)[..., None] / 255
    etched = np.clip(metal * (1 - 0.35 * g) + 0.82 * 0.35 * g, 0, 1)  # a polished mark, a little lighter than the metal
    edge = np.zeros((y1 - y0, x1 - x0), np.float32)
    edge[6:-6, 6:-6] = 1
    m = cv2.GaussianBlur(edge, (0, 0), 3)[..., None]
    t.rgb[y0:y1, x0:x1] = t.rgb[y0:y1, x0:x1] * (1 - m) + etched * m


def paint_head(t: Tex, p: Painter):
    mask = ellipse_mask(t, *MASK)
    p.paint(t, feather(grow(mask, 6), 3), 'an ornate Venetian carnival mask of turquoise lacquer with fine gold filigree '
            'around the eyes', strength=0.7, control=0.6, seed=4, tag='mask')
    head = ellipse_mask(t, *HEAD) * (1 - grow(mask, 10))
    p.paint(t, feather(head, 5), 'portrait of a young Egyptian man with thick dark wavy hair, olive skin, a faint smile',
            strength=0.45, control=0.65, seed=6, tag='head')


def remake(paint=True):
    t = Tex('communication', FG)
    sleeves(t)
    vase(t)
    cartouche(t)
    lid(t)
    if paint:
        paint_head(t, Painter())
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    import sys
    remake(paint='--no-paint' not in sys.argv)
