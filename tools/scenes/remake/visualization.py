"""3D design & visualization: the drawing of the man who points at the floating studies, drawn in Raphael's
turquoise ink instead of red chalk (the paper as it was); the studies he points at become the studio's own
drawings (props.py); the sheet behind him loses its framed portrait for the studio's mark (backdrops.py)."""
import math

import cv2
from PIL import Image, ImageDraw, ImageFont

from paint import Tex, before_after, lab, np, rgb_of, uvmask

FIGURE = 'EW26_Developer_251207v5_compressed-optimized_0_DevforPaintin_Developer_FG.001_BaseColor.1001'
INK = '#0b4a45'
BACK = 'Developer_bg_diffuse-optimized.ktx2'
FRAME = (1645, 185, 1910, 455)  # the little framed sketch on the sheet behind him
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'


def ink(t: Tex, mask: np.ndarray, colour: str = INK, paper_l: float | None = None, depth: float = 58.0):
    """Turns the drawing's strokes (what is darker than the paper) into the ink's colour, by how dark they are;
    the paper itself keeps its own colour."""
    L = lab(t.rgb)
    sel = mask > 0.5
    pl = paper_l if paper_l is not None else np.percentile(L[..., 0][sel], 85)
    amount = np.clip((pl - L[..., 0]) / depth, 0, 1) ** 1.25
    c = lab(np.array([[[int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]]], np.float32))[0, 0]
    out = L.copy()
    paper_ab = np.array([np.median(L[..., 1][sel]), np.median(L[..., 2][sel])])
    # strokes: towards the ink's hue (and a little darker, as ink is); paper: as it was
    out[..., 1] = L[..., 1] * (1 - amount) + (c[1] * 0.9) * amount
    out[..., 2] = L[..., 2] * (1 - amount) + (c[2] * 0.9) * amount
    out[..., 0] = L[..., 0] - 6 * amount
    m = mask[..., None]
    t.rgb = t.rgb * (1 - m) + rgb_of(out) * m
    return pl, paper_ab


def figure():
    t = Tex('visualization', FIGURE)
    pl, ab = ink(t, np.ones((t.h, t.w), np.float32))
    print(f'  paper L {pl:.1f}, ab {ab.round(1)}')
    t.save()
    print(' ', before_after(t))


def sketch_mark(w: int, h: int, seed=7) -> Image.Image:
    """the studio's R in a laurel wreath, drawn by hand in a few nervous strokes (an L mask: ink where white)"""
    s = 4
    rng = np.random.default_rng(seed)
    im = Image.new('L', (w * s, h * s), 0)
    d = ImageDraw.Draw(im)
    cx, cy, r = w * s / 2, h * s / 2, min(w, h) * s * 0.38

    def stroke(pts, width=2.0):
        for k in range(2):  # drawn twice, a little apart, like a pen going over its line
            j = [(x + rng.normal(0, s * 0.8), y + rng.normal(0, s * 0.8)) for x, y in pts]
            d.line(j, fill=int(200 + 55 * (k == 0)), width=int(width * s), joint='curve')

    for side in (-1, 1):  # the two branches of laurel
        arc = [(cx + side * r * math.sin(a), cy + r * math.cos(a) * 0.95) for a in np.linspace(0.25, 2.7, 22)]
        stroke(arc)
        for i in range(2, 21, 2):
            x, y = arc[i]
            a = math.atan2(y - cy, x - cx) + side * 0.9
            for sign in (-1, 1):
                tip = (x + math.cos(a + sign * 0.6) * s * 14, y + math.sin(a + sign * 0.6) * s * 14)
                stroke([(x, y), ((x + tip[0]) / 2 + sign * s * 3, (y + tip[1]) / 2), tip], 1.5)
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(r * 1.15))
    glyph = Image.new('L', im.size, 0)
    ImageDraw.Draw(glyph).text((cx, cy), 'R', font=f, fill=255, anchor='mm')
    g = np.asarray(glyph).astype(np.float32) / 255
    # the letter hatched rather than filled: diagonal lines through it, and its outline
    yy, xx = np.mgrid[0:im.height, 0:im.width]
    hatch = ((xx + yy) % int(5 * s) < s * 1.3).astype(np.float32)
    edge = cv2.morphologyEx(g, cv2.MORPH_GRADIENT, np.ones((5, 5), np.uint8))
    a = np.maximum(np.asarray(im).astype(np.float32) / 255, np.clip(g * hatch * 0.9 + edge, 0, 1))
    return Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)


def backdrop():
    """the sheet behind him: its framed red-chalk portrait -> the studio's mark, drawn in the same turquoise ink"""
    t = Tex('visualization', BACK)
    x0, y0, x1, y1 = FRAME
    inner = (x0 + 40, y0 + 38, x1 - 36, y1 - 36)
    # the paper inside the frame: the sheet's own colour (taken just above the frame) and grain
    w, h = inner[2] - inner[0], inner[3] - inner[1]
    sheet = np.median(t.rgb[60:160, x0:x1].reshape(-1, 3), 0)
    rng = np.random.default_rng(3)
    grain = cv2.GaussianBlur(rng.normal(0, 0.012, (h, w)).astype(np.float32), (0, 0), 0.7)[..., None]
    soft = np.zeros((h, w), np.float32)
    soft[10:-10, 10:-10] = 1
    soft = cv2.GaussianBlur(soft, (0, 0), 5)[..., None]  # into the frame's own shade at its edges
    region = t.rgb[inner[1]:inner[3], inner[0]:inner[2]]
    t.rgb[inner[1]:inner[3], inner[0]:inner[2]] = region * (1 - soft) + np.clip(sheet[None, None] * (1 + grain), 0, 1) * soft
    # the frame's own lines and everything drawn on the sheet: turquoise ink, as on the figure
    ink(t, np.ones((t.h, t.w), np.float32))
    mark = np.asarray(sketch_mark(w, h)).astype(np.float32)[..., None] / 255
    c = np.array([int(INK[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)
    region = t.rgb[inner[1]:inner[3], inner[0]:inner[2]]
    t.rgb[inner[1]:inner[3], inner[0]:inner[2]] = region * (1 - 0.85 * mark) + c * 0.85 * mark
    t.save()
    print(' ', before_after(t, box=(1500, 0, 2048, 600)))


if __name__ == '__main__':
    figure()
    backdrop()
