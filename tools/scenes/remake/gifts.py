"""Promotional gifts: the woman with the card, dressed anew.

  * her hair: auburn -> near black, her face painted anew (paint_head);
  * the beanie -> a silk turban, ivory and turquoise, pinned with gold (paint_head);
  * her gown: sage green -> terracotta; the black velvet and the white chemise as they were;
  * the card in her hand: Raphael's gift card, ivory with gold foil (no chip: config.mjs removes the chip's mesh);
  * the lake behind her: the Nile (backdrops.py).
"""
import cv2
from PIL import Image, ImageDraw, ImageFilter

from paint import Painter, Tex, before_after, ellipse_mask, feather, gradient_map, grow, lab, np, rect, smooth, uvmask

FG = 'EW26_Checkout_251209_compressed-optimized_0_Checkout_fg_diffuse_V7'
FONTS = 'D:/RAhpel/.work-raphael/fonts/src'

TERRACOTTA = [(0.0, '#1c0904'), (0.3, '#5e2511'), (0.6, '#9e4828'), (0.82, '#c97350'), (0.95, '#e9b08e'), (1.0, '#f8dcc8')]
DARK_HAIR = [(0.0, '#040302'), (0.4, '#140d09'), (0.7, '#2a1d15'), (0.9, '#4a3628'), (1.0, '#735a47')]
FACE = ((1065, 1120), (178, 222))  # the face, an ellipse (centre, half axes): hair edits stay out of it
NECK = ((1140, 1390), (135, 120))
CARD = (1550, 670, 2045, 1365)  # the card's face in the texture


def hex3(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def card_art(w: int, h: int, s: int = 3) -> Image.Image:
    """Raphael's gift card: ivory stock, a gold-foil R in an oval, the name, a turquoise rule."""
    from PIL import ImageFont
    W, H = w * s, h * s
    rng = np.random.default_rng(11)
    base = np.ones((H, W, 3), np.float32) * np.array(hex3('#efe8d8'), np.float32)
    base += rng.normal(0, 3.0, (H, W, 1))  # the stock's grain
    im = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA')
    foil = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(foil)
    cx = W // 2
    # the oval and the R
    d.ellipse((cx - W * 0.27, H * 0.13, cx + W * 0.27, H * 0.53), outline=255, width=max(2, s * 2))
    f = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(H * 0.25))
    d.text((cx, H * 0.33), 'R', font=f, fill=255, anchor='mm')
    f2 = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(H * 0.052))
    d.text((cx, H * 0.64), 'RAPHAEL STUDIOS', font=f2, fill=255, anchor='mm')
    f3 = ImageFont.truetype(f'{FONTS}/Philosopher-Regular.ttf', int(H * 0.034))
    d.text((cx, H * 0.715), 'Creative Hub  ·  Cairo', font=f3, fill=255, anchor='mm')
    d.line((cx - W * 0.16, H * 0.79, cx + W * 0.16, H * 0.79), fill=255, width=max(1, s))
    f4 = ImageFont.truetype(f'{FONTS}/Philosopher-Bold.ttf', int(H * 0.04))
    d.text((cx, H * 0.86), 'GIFT CARD', font=f4, fill=255, anchor='mm')
    # gold foil: a soft metallic gradient, a little emboss
    gy = np.linspace(0, 1, H)[:, None]
    gx = np.linspace(0, 1, W)[None, :]
    t = 0.5 + 0.5 * np.sin((gx * 1.3 + gy * 2.1) * np.pi * 1.4)
    gold = (np.array(hex3('#a77a22'))[None, None] * (1 - t[..., None]) + np.array(hex3('#f0d68a'))[None, None] * t[..., None])
    a = np.asarray(foil).astype(np.float32) / 255
    emb = np.asarray(foil.filter(ImageFilter.EMBOSS)).astype(np.float32) / 255 - 0.5
    rgb = np.asarray(im)[..., :3].astype(np.float32)
    rgb = rgb * (1 - a[..., None]) + np.clip(gold + emb[..., None] * 90, 0, 255) * a[..., None]
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(out)
    m = int(W * 0.06)
    d.rounded_rectangle((m, m, W - m, H - m), radius=int(W * 0.05), outline=hex3('#127f76'), width=max(2, s * 2))
    return out.resize((w, h), Image.LANCZOS)


def card(t: Tex):
    x0, y0, x1, y1 = CARD
    art = np.asarray(card_art(x1 - x0, y1 - y0).rotate(180)).astype(np.float32) / 255  # the card's UVs run upside down
    # keep the painted light on the card (its shading, not its colour)
    L = lab(t.rgb[y0:y1, x0:x1])[..., 0]
    shade = cv2.GaussianBlur(L, (0, 0), 18)
    shade = np.clip(shade / np.median(shade), 0.75, 1.15)[..., None]
    m = uvmask(t, 'checkout-card.001')[y0:y1, x0:x1, None]
    t.rgb[y0:y1, x0:x1] = t.rgb[y0:y1, x0:x1] * (1 - m) + np.clip(art * shade, 0, 1) * m


def gown(t: Tex):
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    green = ((ang > 95) & (ang < 200) & (np.hypot(L[..., 1], L[..., 2]) > 9) & (L[..., 0] > 12)).astype(np.float32)
    # the skin of the neck and the chest is shaded with green too (a verdaccio underlayer): it stays out
    skin = feather(ellipse_mask(t, (1160, 1470), (340, 215)), 10)
    body = uvmask(t, 'Checkout.002') * (1 - rect(t, (0, 0, 2048, 1290))) * (1 - skin)
    m = smooth(green * body, t.rgb, r=3)
    gradient_map(t, m, TERRACOTTA, keep=0.08, keep_l=0.35)


def hair(t: Tex):
    L = lab(t.rgb)
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    ch = np.hypot(L[..., 1], L[..., 2])
    auburn = ((ch > 24) & (ang > 30) & (ang < 72) & (L[..., 0] > 15)).astype(np.float32)
    region = np.clip(uvmask(t, 'Checkout.002') + uvmask(t, 'checkout-hand.002'), 0, 1) * (1 - rect(t, (1540, 0, 2048, 2048)))
    face = feather(np.clip(ellipse_mask(t, *FACE) + ellipse_mask(t, *NECK), 0, 1), 12)
    m = smooth(clean_mask(auburn * region), t.rgb, r=4) * (1 - face)
    gradient_map(t, m, DARK_HAIR, keep=0.1, keep_l=0.15)


def clean_mask(m):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    return cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)


def paint_head(t: Tex, p: Painter):
    hat = uvmask(t, 'checkout-hat')
    p.paint(t, grow(hat, 2), 'a Renaissance woman wearing a wrapped silk turban, ivory silk with turquoise silk folds, '
            'pinned with a small gold brooch, soft folds and sheen', strength=0.92, control=0.35, seed=22, tag='turban')
    face = ellipse_mask(t, *FACE)
    p.paint(t, feather(face, 6), 'portrait of a young Egyptian woman with dark brown eyes, dark arched eyebrows, warm olive '
            'skin, full lips, calm gentle expression', strength=0.68, control=0.45, seed=5, tag='face')


def remake(paint=True):
    t = Tex('gifts', FG)
    hair(t)  # first: the new terracotta would read as auburn
    gown(t)
    card(t)
    if paint:
        paint_head(t, Painter())
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    import sys
    remake(paint='--no-paint' not in sys.argv)
