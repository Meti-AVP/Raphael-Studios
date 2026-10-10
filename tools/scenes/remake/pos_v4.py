"""POS (v4): the shop is the studio's, not a skate shop.

  * the wall: the fourteen skateboard decks (the reference's shop) give way to six framed pictures of the studio's own
    point-of-sale work (display stands, packs, a crystal R, a gift box), gilt frames on the same dark wallpaper;
  * the counter: the skateboard, its truck and wheels go (replace.mjs: posCounter takes their triangles out), and so
    do the card reader, the scanner and the cables (config.mjs); their shadows are cleaned off the marble top; the
    tablet on its stand stays (its screen shows the studio's POS work: rebrand.py);
  * the terminal that fell from the dome is the studio's gift box (giftbox.py, replace.mjs: posGiftBox).

    py tools/scenes/remake/pos_v4.py
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from paint import ROOT, SRC, Tex, before_after

WALL = 'Retail_mg_251205v2_compressed-optimized_0_environment-wall.psd'
MEDIA = ROOT / 'src' / 'assets' / 'media'
# product pictures only (no people: no image rights to clear), all visible under policy.ts
WORK = ['dosh-pos', 'neck-labels', 'rivoli-packs', 'glass-r', 'trevi-box', 'packaging-stack']
AREA = (0, 0, 1470, 1060)  # the wallpaper above the frieze (texture pixels)
BAND = (0, 862, 1470, 1060)  # a strip of it with no decks on it
TOP = (1470, 0, 2048, 1470)  # the counter's marble top
KEEP_SHADOW = ((1860, 730), 78)  # the tablet stand's round shadow (it stays)


def wallpaper(t: Tex):
    """the wall without its decks: the clean strip of wallpaper tiled up the wall (cross-faded), under the room's own
    light (the original wall, blurred far beyond its pattern)"""
    x0, y0, x1, y1 = AREA
    bx0, by0, bx1, by1 = BAND
    band = t.rgb[by0:by1, bx0:bx1]
    bh = by1 - by0
    out = np.zeros((y1 - y0, x1 - x0, 3), np.float32)
    acc = np.zeros((y1 - y0, x1 - x0, 1), np.float32)
    fade = 40
    w = np.ones((bh, 1, 1), np.float32)
    w[:fade, 0, 0] = np.linspace(0, 1, fade)
    w[-fade:, 0, 0] = np.linspace(1, 0, fade)
    y = y1 - y0 - bh
    while y > -bh:
        ys, ye = max(0, y), min(y1 - y0, y + bh)
        out[ys:ye] += band[ys - y:ye - y] * w[ys - y:ye - y]
        acc[ys:ye] += w[ys - y:ye - y]
        y -= bh - fade
    tiled = out / np.maximum(acc, 1e-4)
    room = cv2.GaussianBlur(t.rgb[y0:y1, x0:x1], (0, 0), 140).mean(-1, keepdims=True)
    strip = cv2.GaussianBlur(band, (0, 0), 140).mean(-1, keepdims=True).mean(0, keepdims=True)
    light = np.clip(room / np.maximum(strip, 1e-3), 0.6, 1.6)
    t.rgb[y0:y1, x0:x1] = np.clip(tiled * light, 0, 1)


def frame(media_id: str, w: int, h: int, seed: int) -> Image.Image:
    """a picture of the work in a gilt frame with an ivory mat"""
    files = list(MEDIA.glob(f'{media_id}.jpg')) or list(MEDIA.glob(f'{media_id}.png'))
    photo = Image.open(files[0]).convert('RGB')
    gold_w, mat = 22, 26
    inner = (w - 2 * (gold_w + mat), h - 2 * (gold_w + mat))
    pic = ImageOps.fit(photo, inner, Image.LANCZOS)
    im = Image.new('RGB', (w, h), (236, 229, 212))
    im.paste(pic, (gold_w + mat, gold_w + mat))
    # the moulding: a warm gold with a light edge and a dark one
    d = ImageDraw.Draw(im)
    for k in range(gold_w):
        f = k / gold_w
        c = tuple(int(v) for v in (np.array((120, 88, 34)) * (1 - f) + np.array((232, 200, 120)) * f * (1.0 if k < gold_w * 0.6 else 0.8)))
        d.rectangle((k, k, w - 1 - k, h - 1 - k), outline=c)
    d.rectangle((gold_w + mat - 2, gold_w + mat - 2, w - gold_w - mat + 1, h - gold_w - mat + 1), outline=(180, 150, 90), width=2)
    return im


def gallery(t: Tex):
    """six frames on the wall, two rows of three, each with its soft shadow"""
    img = Image.fromarray((np.clip(t.rgb, 0, 1) * 255).astype(np.uint8))
    cols = [(150, 560), (620, 1030), (1090, 1460)]
    rows = [(70, 470), (520, 920)]
    k = 0
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            w, h = x1 - x0 - 30, y1 - y0
            fr = frame(WORK[k % len(WORK)], w, h, k)
            k += 1
            sh = Image.new('L', img.size, 0)
            ImageDraw.Draw(sh).rectangle((x0 + 10, y0 + 18, x0 + 10 + w, y0 + 18 + h), fill=150)
            sh = sh.filter(ImageFilter.GaussianBlur(16))
            img = Image.composite(Image.new('RGB', img.size, (8, 12, 12)), img, sh)
            img.paste(fr, (x0, y0))
    t.rgb = np.asarray(img).astype(np.float32) / 255


def counter(t: Tex):
    """the counter's marble top without the shadows of the things taken away (the stand's shadow stays)"""
    x0, y0, x1, y1 = TOP
    top = t.rgb[y0:y1, x0:x1]
    L = cv2.cvtColor(top.astype(np.float32), cv2.COLOR_RGB2Lab)[..., 0]
    # the shadows are broad and soft, the marble's veins thin: what is well below the marble's light, opened up
    dark = (L < np.percentile(L, 70) - 7).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    dark = cv2.dilate(dark, np.ones((15, 15), np.uint8))
    (cx, cy), r = KEEP_SHADOW
    yy, xx = np.mgrid[y0:y1, x0:x1]
    dark[(xx - cx) ** 2 + (yy - cy) ** 2 < r * r] = 0
    fixed = cv2.inpaint((np.clip(top, 0, 1) * 255).astype(np.uint8), dark * 255, 15, cv2.INPAINT_TELEA).astype(np.float32) / 255
    m = cv2.GaussianBlur(dark.astype(np.float32), (0, 0), 3)[..., None]
    t.rgb[y0:y1, x0:x1] = top * (1 - m) + fixed * m


def main():
    t = Tex('pos', WALL)  # v3 left the wall as v2 had it: the exported source (with v2's edits) is the base
    wallpaper(t)
    gallery(t)
    counter(t)
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    main()
