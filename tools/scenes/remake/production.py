"""Mass production: the guild around the table, dressed anew and with new faces.

  * the chairs: red and rose upholstery -> turquoise velvet;
  * the merchant on the left: navy velvet -> wine velvet (his gold embroidery kept);
  * their five faces painted anew (paint_faces), their eyelids' patches as they were (the faces keep their eyes);
  * the globe: the old map hand-coloured anew, sepia lands, turquoise seas, a gold star on Cairo and the studio's
    compass rose (globe()).
"""
import cv2
from PIL import Image, ImageDraw, ImageFont

from paint import (Painter, Tex, before_after, ellipse_mask, feather, gradient_map, lab, np, poly, smooth)

FG = 'EW26_Operations_251207_compressed-optimized_0_Operations_fg_diffuse_v3'
GLOBE = 'Renaissance_Globe_251209v2-optimized_0_earth_diffuse_flat.psd'
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'

TEAL_VELVET = [(0.0, '#010a09'), (0.35, '#053a35'), (0.65, '#0f6b62'), (0.88, '#36a194'), (1.0, '#a5ddd4')]
WINE_VELVET = [(0.0, '#060103'), (0.4, '#25060f'), (0.7, '#4a0f22'), (0.9, '#73283c'), (1.0, '#b0707f')]


def crop_pts(pts):
    """points traced on a crop of the painting (x * 1.6664, 700 + y * 1.6664) -> texture pixels"""
    return [(int(x * 1.6664), int(700 + y * 1.6664)) for x, y in pts]


CHAIR_L = crop_pts([(20, 120), (70, 70), (130, 90), (150, 140), (130, 300), (120, 480), (60, 520), (20, 480)])
CHAIR_R = [(1790, 800), (1900, 750), (2048, 760), (2048, 1460), (1960, 1460), (1900, 1200), (1800, 1000)]
MERCHANT = crop_pts([(100, 150), (210, 40), (330, 100), (420, 180), (465, 300), (455, 420), (450, 600), (40, 600),
                     (25, 500), (60, 300)])
# the five faces: centre and half axes, texture pixels
FACES = {
    'merchant': ((480, 545), (78, 118)),
    'youth': ((714, 628), (76, 125)),
    'scholar': ((1014, 632), (78, 140)),
    'lady': ((1334, 640), (66, 112)),
    'noblewoman': ((1600, 690), (82, 140)),
}


def chairs(t: Tex):
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    red = ((ang < 55) & (ang > -40) & (np.hypot(L[..., 1], L[..., 2]) > 5)).astype(np.float32)  # red, and the pale rose
    m = smooth(red * np.clip(poly(t, CHAIR_L) + poly(t, CHAIR_R), 0, 1), t.rgb, r=3)
    gradient_map(t, m, TEAL_VELVET, keep=0.05, keep_l=0.4)


def merchant(t: Tex):
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    blue = ((ang < -40) & (ang > -175) & (np.hypot(L[..., 1], L[..., 2]) > 5)).astype(np.float32)
    m = smooth(blue * poly(t, MERCHANT), t.rgb, r=3)
    gradient_map(t, m, WINE_VELVET, keep=0.04, keep_l=0.45, lo=1, hi=99.5)


def globe():
    t = Tex('production', GLOBE)
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    ch = np.hypot(L[..., 1], L[..., 2])
    # the lands' greens -> sepia and ochre (the hue turned, the painting kept)
    green = np.clip((ang - 88) / 8, 0, 1) * np.clip((ch - 8) / 6, 0, 1)
    out = L.copy()
    c = ch * 0.9
    a_ = np.radians(72)
    out[..., 1] = np.where(green > 0, L[..., 1] * (1 - green) + c * np.cos(a_) * green, L[..., 1])
    out[..., 2] = np.where(green > 0, L[..., 2] * (1 - green) + c * np.sin(a_) * green, L[..., 2])
    # the seas (the light parchment between the lands): a turquoise wash, as on a hand-coloured map
    sea = np.clip((L[..., 0] - 70) / 8, 0, 1) * np.clip((22 - ch) / 6, 0, 1)
    sea = cv2.GaussianBlur(sea.astype(np.float32), (0, 0), 3)
    wash = np.array([-14.0, -6.0])
    out[..., 1] = out[..., 1] * (1 - 0.8 * sea) + wash[0] * 0.8 * sea
    out[..., 2] = out[..., 2] * (1 - 0.8 * sea) + wash[1] * 0.8 * sea
    out[..., 0] = out[..., 0] - 4 * sea
    from paint import rgb_of
    t.rgb = rgb_of(out)
    # Cairo, and the studio's compass rose in the Indian Ocean
    s = 4
    over = Image.new('RGBA', (t.w * s, t.h * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    gold = (196, 150, 52, 255)
    cx, cy = 598 * s, 178 * s  # Cairo, on this map
    star = [(cx + r * np.cos(np.pi / 2 + k * np.pi / 5) * s, cy - r * np.sin(np.pi / 2 + k * np.pi / 5) * s)
            for k, r in enumerate([7, 3] * 5)]
    d.polygon(star, fill=gold)
    rx, ry, R = 745 * s, 335 * s, 34 * s
    for k in range(16):
        ln = R if k % 4 == 0 else (R * 0.62 if k % 2 == 0 else R * 0.42)
        a = k * np.pi / 8
        tip = (rx + ln * np.cos(a), ry + ln * np.sin(a))
        l1 = (rx + 4 * s * np.cos(a + np.pi / 2), ry + 4 * s * np.sin(a + np.pi / 2))
        l2 = (rx + 4 * s * np.cos(a - np.pi / 2), ry + 4 * s * np.sin(a - np.pi / 2))
        d.polygon([l1, tip, l2], fill=gold if k % 2 == 0 else (120, 86, 30, 255))
    d.ellipse((rx - 0.3 * R, ry - 0.3 * R, rx + 0.3 * R, ry + 0.3 * R), outline=gold, width=2 * s)
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', 15 * s)
    d.text((rx, ry), 'R', font=f, fill=(90, 60, 20, 255), anchor='mm')
    over = over.resize((t.w, t.h), Image.LANCZOS)
    a = np.asarray(over).astype(np.float32) / 255
    t.rgb = t.rgb * (1 - a[..., 3:]) + a[..., :3] * a[..., 3:]
    t.save()
    print(' ', before_after(t))


def paint_faces(t: Tex, p: Painter):
    words = {
        'merchant': 'portrait of an older African merchant with a short grey beard, deep brown skin, wise calm eyes',
        'youth': 'portrait of a young Egyptian man, olive skin, dark eyes, dark eyebrows, clean shaven, attentive',
        'scholar': 'portrait of a middle aged Egyptian man with a full black beard, warm brown skin, kind eyes',
        'lady': 'portrait of a young woman with dark hair, olive skin, brown eyes, gentle expression',
        'noblewoman': 'portrait of a Nubian noblewoman, dark skin, high cheekbones, serene and proud, full lips',
    }
    for k, (c, ax) in FACES.items():
        p.paint(t, feather(ellipse_mask(t, c, ax), 5), words[k], strength=0.62, control=0.55, seed=13, tag=f'face-{k}')


def remake(paint=True):
    t = Tex('production', FG)
    chairs(t)
    merchant(t)
    if paint:
        paint_faces(t, Painter())
    t.save()
    print(' ', before_after(t))
    globe()


if __name__ == '__main__':
    import sys
    remake(paint='--no-paint' not in sys.argv)
