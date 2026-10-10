"""3D design & visualization: the studies floating before the drawn man, the studio's own drawings in place of the
reference's machines: a box's dieline, a T-shirt, a cap, an exhibition booth, a tote bag and a roll-up banner, with
their measures and notes, in white lines on black (the cubes add them over the scene, as before)."""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from paint import Tex, before_after

LAYERS = 'EW26_Developer_251207v5_compressed-optimized_1_Developer_fg_layeringv2'
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'
S = 3  # drawn large, then reduced: fine, even lines
W = 1024 * S
INK = (236, 236, 228)


def pen(width=1.2):
    return max(1, int(width * S * 1.8))  # bold enough to read on the small floating cubes


def font(size, name='Philosopher-Regular.ttf'):
    return ImageFont.truetype(f'{FONTS}/{name}', int(size * S))


def note(d, xy, text, size=13, script=True):
    d.text((xy[0] * S, xy[1] * S), text, font=font(size * (1.5 if script else 1), 'ImperialScript-Regular.ttf' if script else 'Philosopher-Regular.ttf'), fill=INK)


def measure(d, a, b, label, off=14, size=10):
    """a dimension line between a and b, offset to its left, with ticks and the measure written along it"""
    (x0, y0), (x1, y1) = a, b
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy)
    nx, ny = -dy / n * off, dx / n * off
    p0, p1 = (x0 + nx, y0 + ny), (x1 + nx, y1 + ny)
    d.line([(p0[0] * S, p0[1] * S), (p1[0] * S, p1[1] * S)], fill=INK, width=pen(0.8))
    for p in (p0, p1):
        d.line([((p[0] - dy / n * 4) * S, (p[1] + dx / n * 4) * S), ((p[0] + dy / n * 4) * S, (p[1] - dx / n * 4) * S)], fill=INK, width=pen(0.8))
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    d.text((mx * S, my * S), label, font=font(size), fill=INK, anchor='mm')


def poly(d, pts, width=1.3, close=True, dash=0):
    pts = [(x * S, y * S) for x, y in pts]
    if close:
        pts = pts + [pts[0]]
    if not dash:
        d.line(pts, fill=INK, width=pen(width), joint='curve')
        return
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / (dash * S)))
        for i in range(0, n, 2):
            a, b = i / n, min(1, (i + 1) / n)
            d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=INK, width=pen(width * 0.8))


def dieline(d, ox, oy, k=1.0):
    """a tuck-end box, flat: four panels, the tuck flaps and the dust flaps; folds dashed"""
    w, h, dep = 70 * k, 110 * k, 40 * k
    xs = [ox, ox + dep, ox + dep + w, ox + 2 * dep + w, ox + 2 * dep + 2 * w]
    for x0, x1 in zip(xs, xs[1:]):
        poly(d, [(x0, oy), (x1, oy), (x1, oy + h), (x0, oy + h)], dash=0 if x0 == ox else 0)
    poly(d, [(xs[1], oy), (xs[1], oy + h)], dash=4)
    poly(d, [(xs[2], oy), (xs[2], oy + h)], dash=4)
    poly(d, [(xs[3], oy), (xs[3], oy + h)], dash=4)
    # tuck flaps top and bottom, dust flaps
    poly(d, [(xs[1], oy), (xs[1] + 6, oy - dep), (xs[2] - 6, oy - dep), (xs[2], oy)], close=False)
    poly(d, [(xs[1] + 10, oy - dep), (xs[1] + 14, oy - dep - 14), (xs[2] - 14, oy - dep - 14), (xs[2] - 10, oy - dep)], close=False)
    poly(d, [(xs[3], oy + h), (xs[3] + 6, oy + h + dep), (xs[4] - 6, oy + h + dep), (xs[4], oy + h)], close=False)
    poly(d, [(xs[0], oy), (xs[0] + 4, oy - dep * 0.8), (xs[1] - 2, oy - dep * 0.8), (xs[1], oy)], close=False)
    poly(d, [(xs[2], oy + h), (xs[2] + 4, oy + h + dep * 0.8), (xs[3] - 2, oy + h + dep * 0.8), (xs[3], oy + h)], close=False)
    measure(d, (xs[1], oy + h), (xs[2], oy + h), f'{int(w * 1.4)} mm', off=-16)
    measure(d, (xs[4], oy + h), (xs[4], oy), f'{int(h * 1.4)} mm', off=-16)
    d.text(((xs[1] + xs[2]) / 2 * S, (oy + h / 2) * S), 'R', font=font(28 * k, 'Philosopher-Bold.ttf'), fill=INK, anchor='mm')


def tee(d, ox, oy, k=1.0):
    p = [(0, 18), (30, 0), (48, 8), (62, 8), (80, 0), (110, 18), (98, 44), (86, 38), (86, 130), (24, 130), (24, 38), (12, 44)]
    poly(d, [(ox + x * k, oy + y * k) for x, y in p])
    poly(d, [(ox + 48 * k, oy + 8 * k), (ox + 55 * k, oy + 18 * k), (ox + 62 * k, oy + 8 * k)], close=False)
    poly(d, [(ox + 44 * k, oy + 40 * k), (ox + 66 * k, oy + 40 * k), (ox + 66 * k, oy + 62 * k), (ox + 44 * k, oy + 62 * k)], dash=3)
    measure(d, (ox + 24 * k, oy + 130 * k), (ox + 86 * k, oy + 130 * k), '52 cm', off=-14)
    note(d, (ox + 70 * k, oy + 46 * k), 'print 9 x 9', 9)


def cap(d, ox, oy, k=1.0):
    pts = [(ox + (60 + 55 * math.cos(a)) * k, oy + (60 - 48 * math.sin(a)) * k) for a in np.linspace(0, math.pi, 24)]
    poly(d, pts + [(ox + 5 * k, oy + 60 * k)], close=False)
    poly(d, [(ox + 5 * k, oy + 60 * k), (ox + 115 * k, oy + 60 * k), (ox + 160 * k, oy + 72 * k), (ox + 110 * k, oy + 74 * k),
             (ox + 60 * k, oy + 66 * k)], close=False)
    for a in (0.6, 1.2, 1.9, 2.5):
        poly(d, [(ox + 60 * k, oy + 12 * k), (ox + (60 + 55 * math.cos(a)) * k, oy + (60 - 48 * math.sin(a)) * k)], close=False, dash=3)
    d.text(((ox + 60 * k) * S, (oy + 40 * k) * S), 'R', font=font(18 * k, 'Philosopher-Bold.ttf'), fill=INK, anchor='mm')
    note(d, (ox + 20 * k, oy + 84 * k), 'embroidered, 3D puff', 9)


def booth(d, ox, oy, k=1.0):
    """an exhibition booth, front elevation: the back wall, the fascia, the counter, a screen"""
    poly(d, [(ox, oy + 30 * k), (ox + 200 * k, oy + 30 * k), (ox + 200 * k, oy + 170 * k), (ox, oy + 170 * k)])
    poly(d, [(ox - 10 * k, oy), (ox + 210 * k, oy), (ox + 210 * k, oy + 30 * k), (ox - 10 * k, oy + 30 * k)])
    d.text(((ox + 100 * k) * S, (oy + 15 * k) * S), 'RAPHAEL STUDIOS', font=font(13 * k, 'Philosopher-Bold.ttf'), fill=INK, anchor='mm')
    poly(d, [(ox + 60 * k, oy + 110 * k), (ox + 140 * k, oy + 110 * k), (ox + 140 * k, oy + 170 * k), (ox + 60 * k, oy + 170 * k)])
    poly(d, [(ox + 55 * k, oy + 104 * k), (ox + 145 * k, oy + 104 * k), (ox + 145 * k, oy + 110 * k), (ox + 55 * k, oy + 110 * k)])
    poly(d, [(ox + 20 * k, oy + 45 * k), (ox + 80 * k, oy + 45 * k), (ox + 80 * k, oy + 85 * k), (ox + 20 * k, oy + 85 * k)])
    poly(d, [(ox + 150 * k, oy + 50 * k), (ox + 185 * k, oy + 50 * k), (ox + 185 * k, oy + 150 * k), (ox + 150 * k, oy + 150 * k)], dash=4)
    measure(d, (ox, oy + 170 * k), (ox + 200 * k, oy + 170 * k), '3 m', off=-16)
    measure(d, (ox + 210 * k, oy + 170 * k), (ox + 210 * k, oy), '2.5 m', off=-14)
    note(d, (ox + 150 * k, oy + 155 * k), 'light box', 9)


def tote(d, ox, oy, k=1.0):
    poly(d, [(ox, oy + 30 * k), (ox + 90 * k, oy + 30 * k), (ox + 96 * k, oy + 130 * k), (ox - 6 * k, oy + 130 * k)])
    for x in (18, 62):
        pts = [(ox + (x + 14 * math.cos(a)) * k, oy + (30 - 26 * math.sin(a)) * k) for a in np.linspace(0, math.pi, 12)]
        poly(d, pts, close=False)
    d.text(((ox + 45 * k) * S, (oy + 80 * k) * S), 'R', font=font(30 * k, 'Philosopher-Bold.ttf'), fill=INK, anchor='mm')
    note(d, (ox - 4 * k, oy + 140 * k), 'cotton 280 g', 9)


def banner(d, ox, oy, k=1.0):
    poly(d, [(ox, oy), (ox + 60 * k, oy), (ox + 60 * k, oy + 170 * k), (ox, oy + 170 * k)])
    poly(d, [(ox - 6 * k, oy + 170 * k), (ox + 66 * k, oy + 170 * k), (ox + 66 * k, oy + 178 * k), (ox - 6 * k, oy + 178 * k)])
    poly(d, [(ox + 30 * k, oy + 178 * k), (ox + 30 * k, oy + 190 * k)], close=False)
    d.text(((ox + 30 * k) * S, (oy + 40 * k) * S), 'R', font=font(26 * k, 'Philosopher-Bold.ttf'), fill=INK, anchor='mm')
    for i in range(4):
        poly(d, [(ox + 10 * k, oy + (80 + i * 14) * k), (ox + 50 * k, oy + (80 + i * 14) * k)], close=False, width=0.8)
    measure(d, (ox + 60 * k, oy + 170 * k), (ox + 60 * k, oy), '200 cm', off=-12)


def compass(d, cx, cy, r):
    d.ellipse(((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S), outline=INK, width=pen(0.8))
    for a in np.linspace(0, 2 * math.pi, 9)[:-1]:
        poly(d, [(cx, cy), (cx + r * 1.15 * math.cos(a), cy + r * 1.15 * math.sin(a))], close=False, width=0.6)


def box3d(d, ox, oy, k=1.0):
    """a box in two-point perspective, its hidden edges dashed, the vanishing lines faint"""
    a = (ox, oy + 60 * k)
    b = (ox + 70 * k, oy + 82 * k)
    c = (ox + 140 * k, oy + 52 * k)
    up = 70 * k
    top = [(x, y - up) for x, y in (a, b, c)]
    back = (ox + 72 * k, oy + 34 * k - up)
    poly(d, [a, b, c], close=False)
    poly(d, [top[0], top[1], top[2], back], close=True)
    for p_, q in zip((a, b, c), top):
        poly(d, [p_, q], close=False)
    poly(d, [(ox + 72 * k, oy + 34 * k), back], close=False, dash=3)
    poly(d, [a, (ox + 72 * k, oy + 34 * k), c], close=False, dash=3)
    for p_ in (top[0], top[2]):  # the vanishing lines, faint
        poly(d, [p_, ((p_[0] - ox) * 3 + ox, (p_[1] - oy) * 0.2 + oy)], close=False, width=0.4)
    d.text(((ox + 40 * k) * S, (oy + 45 * k) * S), 'R', font=font(16 * k, 'Philosopher-Bold.ttf'), fill=INK, anchor='mm')


def rays(d, cx, cy, targets):
    """faint construction lines from one point to the drawings, as in a study sheet"""
    for x, y in targets:
        poly(d, [(cx, cy), (x, y)], close=False, width=0.35)


def draw() -> Image.Image:
    im = Image.new('RGB', (W, W), (0, 0, 0))
    d = ImageDraw.Draw(im)
    dieline(d, 60, 110, 1.0)
    booth(d, 600, 80, 1.6)
    tee(d, 90, 420, 1.3)
    cap(d, 330, 470, 1.2)
    tote(d, 600, 470, 1.2)
    banner(d, 820, 420, 1.1)
    dieline(d, 520, 760, 0.8)
    tee(d, 60, 760, 0.9)
    compass(d, 360, 820, 46)
    note(d, (40, 30), 'Raphael Studios — studio notes, Cairo MMXXVI', 16)
    note(d, (60, 330), 'tuck end · 350 g board · matt lamination', 11)
    note(d, (640, 380), 'booth A · front', 12)
    note(d, (300, 680), 'cap · 6 panels', 11)
    note(d, (360, 900), 'scale 1:10', 11)
    note(d, (700, 980), 'packaging · inner box', 11)
    box3d(d, 330, 120, 1.3)
    box3d(d, 800, 720, 1.0)
    rays(d, 360, 820, [(60, 110), (600, 80), (950, 300), (90, 420), (820, 420), (520, 760), (940, 940)])
    compass(d, 940, 300, 30)
    note(d, (330, 245), 'gift box · two piece, foil R', 11)
    note(d, (800, 840), 'mailer · kraft', 11)
    note(d, (40, 590), 'tee · front, chest print', 11)
    note(d, (810, 620), 'roll-up', 11)
    return im.resize((1024, 1024), Image.LANCZOS)


def remake():
    t = Tex('visualization', LAYERS)
    t.rgb = np.asarray(draw()).astype(np.float32) / 255
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    remake()
