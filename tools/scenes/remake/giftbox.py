"""POS (v4): the reference's terminal (a product of its own maker) is replaced by the studio's gift box, which makes the
same journey (it falls from the dome and lands on the counter) and opens the same way: the lid lifts (where the
terminal's shell lifted) and shows a gift card lying in the tray (where its circuit board was).

This draws the box's printing: one atlas (art/scenes/pos/giftbox.png) and where each face sits in it (giftbox.json),
painted with its light (the scenes' materials are unlit). tools/scenes/replace.mjs builds the box from them.

    py tools/scenes/remake/giftbox.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'art' / 'scenes' / 'pos'
FONTS = Path('D:/RAhpel/.work-raphael/fonts/src')
S = 2048
TURQ = (25, 181, 168)
DEEP = (12, 110, 102)
GOLD = (214, 176, 96)
IVORY = (240, 233, 218)

# the faces' cells (x0, y0, x1, y1), in pixels of the atlas
CELLS = {
    'lid_top': (0, 0, 1024, 683),
    'lid_long': (0, 700, 1024, 836),
    'lid_short': (1040, 700, 1720, 836),
    'base_long': (0, 860, 1024, 1102),
    'base_short': (1040, 860, 1724, 1102),
    'base_top': (0, 1120, 1024, 1803),
    'card_top': (1040, 0, 2048, 672),
    'card_edge': (1040, 1120, 2048, 1160),
}


def font(size, weight='Bold'):
    return ImageFont.truetype(str(FONTS / f'Philosopher-{weight}.ttf'), size)


def script(size):
    return ImageFont.truetype(str(FONTS / 'ImperialScript-Regular.ttf'), size)


def paper_grain(w, h, colour, amount=6, seed=1):
    rng = np.random.default_rng(seed)
    a = np.ones((h, w, 3), np.float32) * np.array(colour, np.float32)
    a += rng.normal(0, amount, (h, w, 1))
    return a


def light(a, top=1.06, bottom=0.86, left=1.0, right=0.94):
    """a soft painted light over a face: from its top left"""
    h, w = a.shape[:2]
    gy = np.linspace(top, bottom, h)[:, None, None]
    gx = np.linspace(left, right, w)[None, :, None]
    return a * gy * gx


def draw_cell(img, cell, arr):
    x0, y0, x1, y1 = cell
    img.paste(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)), (x0, y0))


def foil(d_mask: Image.Image, w, h):
    """gold foil: a warm metallic sweep where the mask is set"""
    gx = np.linspace(0, 1, w)[None, :]
    gy = np.linspace(0, 1, h)[:, None]
    t = 0.5 + 0.5 * np.sin((gx * 1.4 + gy * 2.2) * np.pi * 1.6)
    lo, hi = np.array((150, 112, 46), np.float32), np.array((246, 222, 150), np.float32)
    col = lo[None, None] * (1 - t[..., None]) + hi[None, None] * t[..., None]
    a = np.asarray(d_mask).astype(np.float32)[..., None] / 255
    emb = np.asarray(d_mask.filter(ImageFilter.EMBOSS)).astype(np.float32)[..., None] / 255 - 0.5
    return col + emb * 70, a


def lid_top():
    x0, y0, x1, y1 = CELLS['lid_top']
    w, h = x1 - x0, y1 - y0
    base = light(paper_grain(w, h, TURQ, 5, 2))
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((40, 40, w - 40, h - 40), radius=26, outline=255, width=6)
    d.ellipse((w / 2 - 170, h / 2 - 200, w / 2 + 170, h / 2 + 140), outline=255, width=7)
    d.text((w / 2, h / 2 - 30), 'R', font=font(250), fill=255, anchor='mm')
    d.text((w / 2, h / 2 + 215), 'RAPHAEL STUDIOS', font=font(64), fill=255, anchor='mm')
    col, a = foil(m, w, h)
    return base * (1 - a) + col * a


def band(cell, colour, text=None, size=0.5, seed=3, rules=False):
    """a side of the box: its colour, and either a word in foil or (the box turns over on its way down: no word
    there may be read upside down) two foil rules"""
    x0, y0, x1, y1 = cell
    w, h = x1 - x0, y1 - y0
    base = light(paper_grain(w, h, colour, 5, seed), top=1.0, bottom=0.82)
    if not text and not rules:
        return base
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    if rules:
        for f in (0.32, 0.68):
            d.rectangle((int(w * 0.04), int(h * f) - 3, int(w * 0.96), int(h * f) + 3), fill=255)
    else:
        d.text((w / 2, h / 2), text, font=font(int(h * size)), fill=255, anchor='mm')
    col, a = foil(m, w, h)
    return base * (1 - a) + col * a


def card():
    x0, y0, x1, y1 = CELLS['card_top']
    w, h = x1 - x0, y1 - y0
    base = light(paper_grain(w, h, IVORY, 4, 7), top=1.04, bottom=0.94)
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((34, 34, w - 34, h - 34), radius=20, outline=255, width=5)
    d.text((w / 2, h * 0.36), 'R', font=font(190), fill=255, anchor='mm')
    d.text((w / 2, h * 0.68), 'Thank you', font=script(150), fill=255, anchor='mm')
    col, a = foil(m, w, h)
    out = base * (1 - a) + col * a
    # a turquoise rule under the words
    out[int(h * 0.84):int(h * 0.84) + 6, int(w * 0.36):int(w * 0.64)] = TURQ
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    img = Image.new('RGB', (S, S), (12, 110, 102))
    draw_cell(img, CELLS['lid_top'], lid_top())
    draw_cell(img, CELLS['lid_long'], band(CELLS['lid_long'], TURQ, rules=True))
    draw_cell(img, CELLS['lid_short'], band(CELLS['lid_short'], TURQ, rules=True))
    draw_cell(img, CELLS['base_long'], band(CELLS['base_long'], DEEP, rules=True, seed=5))
    draw_cell(img, CELLS['base_short'], band(CELLS['base_short'], DEEP, None, seed=6))
    x0, y0, x1, y1 = CELLS['base_top']
    tray = paper_grain(x1 - x0, y1 - y0, (9, 86, 80), 4, 8)
    yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]
    rim = np.minimum.reduce([xx, yy, (x1 - x0) - xx, (y1 - y0) - yy]).astype(np.float32)
    tray *= (0.7 + 0.3 * np.clip(rim / 60, 0, 1))[..., None]  # the tray's walls shade its floor
    draw_cell(img, CELLS['base_top'], tray)
    draw_cell(img, CELLS['card_top'], card())
    draw_cell(img, CELLS['card_edge'], band(CELLS['card_edge'], (226, 218, 200), None, seed=9))
    img.save(OUT / 'giftbox.png')
    (OUT / 'giftbox.json').write_text(json.dumps({'size': S, 'cells': CELLS}, indent=1))
    small = img.copy()
    small.thumbnail((1024, 1024))
    small.save(Path('D:/RAhpel/.work-raphael/v4-shots/giftbox.jpg'), quality=88)
    print('  giftbox atlas written')


if __name__ == '__main__':
    main()
