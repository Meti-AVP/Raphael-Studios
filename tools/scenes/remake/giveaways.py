"""Giveaways: the juggler under the moon, in saffron silk instead of rose; her silver sleeves, her skin and her hair
as they were. The tokens raining on her and the phone in her hand are remade in tools/scenes/remake/props (the
tokens become Raphael's enamel pins); the night garden is repainted in backdrops.py."""
from PIL import Image, ImageDraw, ImageFont

from paint import Clusters, Tex, before_after, bleed, gradient_map, np, shrink, uvmask

WOMAN = 'EW26_Finance_251208v2_compressed-optimized_1_EW26_Finance_251204_WomanDiffuse'
TREES = 'EW26_Finance_251208v2_compressed-optimized_0_Finance-tree'
COIN = ((674.5, 340.5), 23.5)  # the coin's face in the trees' texture: centre and radius
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'
SAFFRON_SILK = [(0.0, '#1f0e02'), (0.3, '#74400a'), (0.6, '#c98714'), (0.82, '#ecba48'), (0.95, '#f8df92'), (1.0, '#fff4d2')]


def dress():
    t = Tex('giveaways', WOMAN)
    inside = uvmask(t)
    core = shrink(inside, 2)
    c = Clusters(t, core, 7)
    c.describe()
    rose = c.pick(lambda l, ch, h: ch > 14 and h < 67 and l > 25)  # the rose silk, lit and in half shade
    shade = c.pick(lambda l, ch, h: ch > 12 and h < 60 and l <= 25)  # its deep folds (only in its own islands)
    skin = c.pick(lambda l, ch, h: ch > 18 and 67 <= h < 80)  # her skin: a little yellower than the silk
    print('  rose', rose, 'shade', shade, 'skin', skin)
    g = c.islands({'rose': rose, 'shade': shade, 'skin': skin}, core, majority=0.5)
    m = np.clip(g['rose'] + g['shade'] * g['rose:whole'], 0, 1) * (1 - g['skin:whole'])
    gradient_map(t, m * core, SAFFRON_SILK, keep=0.1, keep_l=0.25)
    bleed(t, core)
    t.save()
    print(' ', before_after(t))


def pins():
    """the coins raining on her become the studio's enamel pins: a gold rim, turquoise enamel, a gold R"""
    t = Tex('giveaways', TREES)
    (cx, cy), r = COIN
    s = 8
    R = int(r * s)
    size = 2 * R + 8 * s
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    d.ellipse((c - R, c - R, c + R, c + R), fill=(201, 160, 72, 255))  # the gold rim
    e = R * 0.84
    d.ellipse((c - e, c - e, c + e, c + e), fill=(18, 158, 146, 255))  # the enamel
    hi = R * 0.6  # a soft highlight on the enamel
    d.ellipse((c - e * 0.9, c - e * 0.95, c + hi * 0.3, c - hi * 0.1), fill=(70, 200, 188, 255))
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(R * 1.15))
    d.text((c, c + R * 0.04), 'R', font=f, fill=(232, 196, 104, 255), anchor='mm')
    im = im.resize((size // s, size // s), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    x0, y0 = int(round(cx - a.shape[1] / 2)), int(round(cy - a.shape[0] / 2))
    m = a[..., 3:]
    t.rgb[y0:y0 + a.shape[0], x0:x0 + a.shape[1]] = t.rgb[y0:y0 + a.shape[0], x0:x0 + a.shape[1]] * (1 - m) + a[..., :3] * m
    t.save()
    print(' ', before_after(t, box=(600, 280, 760, 400)))


if __name__ == '__main__':
    dress()
    pins()
