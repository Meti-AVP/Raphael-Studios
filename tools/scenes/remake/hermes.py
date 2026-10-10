"""Packaging (v4): the animal is gone. In its place a white marble statue of Hermes, the messenger of the gods and the
patron of merchants and of everything carried from one place to another, stands on the pedestal and holds the studio's
turquoise box above his head.

  1. the pedestal's texture: the little gold lock that hung where the animal's belt was is made transparent (it is a
     quad of the pedestal's own model);
  2. capture.mjs packaging 2.4 --dpr 2: the scene's frame without the animal, its camera, where the box is;
  3. Hermes painted into that frame by SDXL around the box (the box itself stays the real 3D one);
  4. his outline from Depth Anything, his relief raised along the camera's rays around the box's distance
     (relief.py), written as art/scenes/packaging/hermes.glb, the scene's asset 'statue' (config.mjs).

    py tools/scenes/remake/hermes.py [--seed N] [--no-paint]
"""
import os
import sys

import numpy as np
from PIL import Image

from paint import ROOT, SRC, Painter, before_after, feather, grow, rect
from relief import cutout, depth, frame_tex, load_capture, raise_, screen_box, write_glb
from statue import CARVE_NEG, base

FG = 'EW26_Shipping_251204_compressed-optimized_0_Shipping_fg_Merged_V5'
LOCK = (1958, 436, 2046, 580)  # the lock's quad in the texture
SEED = int(sys.argv[sys.argv.index('--seed') + 1]) if '--seed' in sys.argv else 75  # chosen among 71-76
PROMPT = ('front view of a white marble statue of Hermes, the young messenger god, his calm face and short curly hair '
          'visible below the box, small wings on his sandals, a cloak over one shoulder, slender athletic body in classical '
          'proportions, walking forward and holding a box high above his head with both raised arms, Greek sculpture, '
          'full figure')
STYLE = 'classical white marble sculpture, carved stone, Renaissance oil painting of a statue, soft moonlight, museum quality'


TOP = (1806, 590, 1900, 1950)  # the pedestal's top face in the texture (with the animal's long shadow on it)


def pedestal():
    import cv2
    t = base('packaging', FG)
    x0, y0, x1, y1 = LOCK
    t.alpha[y0:y1, x0:x1] = 0
    # the animal's shadow on the top face: what is clearly darker than the stone around it, filled from that stone
    x0, y0, x1, y1 = TOP
    face = t.rgb[y0:y1, x0:x1]
    L = cv2.cvtColor(face.astype(np.float32), cv2.COLOR_RGB2Lab)[..., 0]
    dark = (L < np.percentile(L, 80) - 9).astype(np.uint8)
    dark = cv2.dilate(dark, np.ones((9, 9), np.uint8))
    fixed = cv2.inpaint((np.clip(face, 0, 1) * 255).astype(np.uint8), dark * 255, 9, cv2.INPAINT_TELEA).astype(np.float32) / 255
    t.rgb[y0:y1, x0:x1] = cv2.GaussianBlur(fixed, (0, 0), 1.2) * dark[..., None] + face * (1 - dark[..., None])
    t.save()
    print(' ', before_after(t, box=(1700, 300, 2048, 800)))


def guide(t, box, top_y):
    """a plain figure drawn under the box (light stone, dark outline), the pose SDXL follows: the head clearly below the
    box, both arms raised to its bottom corners, a step forward; -> its silhouette"""
    from PIL import ImageDraw
    bx0, by0, bx1, by1 = box
    cx = (bx0 + bx1) / 2
    bw = bx1 - bx0
    hgt = top_y - by1  # from the box's bottom to his feet
    u = hgt / 100  # one hundredth of his height (hands at 0, feet at 100)
    im = Image.fromarray((np.clip(t.rgb, 0, 1) * 255).astype(np.uint8))
    sil = Image.new('L', im.size, 0)
    fill, line = (222, 216, 205), (96, 90, 82)
    for d, col in ((ImageDraw.Draw(im), fill), (ImageDraw.Draw(sil), 255)):
        # classical proportions, seen from the front: head 12 of the 93 from its top to the soles
        d.ellipse((cx - 5 * u, by1 + 7 * u, cx + 5 * u, by1 + 19 * u), fill=col)
        d.polygon([(cx - 3 * u, by1 + 17 * u), (cx + 3 * u, by1 + 17 * u), (cx + 3.5 * u, by1 + 23 * u), (cx - 3.5 * u, by1 + 23 * u)], fill=col)
        d.polygon([(cx - 11 * u, by1 + 23 * u), (cx + 11 * u, by1 + 23 * u), (cx + 8 * u, by1 + 49 * u), (cx - 8 * u, by1 + 49 * u)], fill=col)
        # the cloak from the left shoulder down the side to the knee
        d.polygon([(cx - 12 * u, by1 + 22 * u), (cx - 6 * u, by1 + 23 * u), (cx - 7 * u, by1 + 70 * u), (cx - 15 * u, by1 + 66 * u)], fill=col)
        for side in (-1, 1):
            hx = cx + side * (bw * 0.33)
            d.line([(cx + side * 10 * u, by1 + 25 * u), (cx + side * 14 * u, by1 + 12 * u), (hx, by1 + 1 * u)], fill=col, width=int(4.5 * u))
            d.ellipse((hx - 3 * u, by1 - 2 * u, hx + 3 * u, by1 + 4 * u), fill=col)
        # walking: the left leg forward, the right behind
        d.line([(cx - 4 * u, by1 + 48 * u), (cx - 9 * u, by1 + 72 * u), (cx - 13 * u, by1 + 97 * u)], fill=col, width=int(6 * u))
        d.line([(cx + 4 * u, by1 + 48 * u), (cx + 6 * u, by1 + 73 * u), (cx + 9 * u, by1 + 97 * u)], fill=col, width=int(6 * u))
        d.ellipse((cx - 20 * u, by1 + 95 * u, cx - 9 * u, by1 + 100 * u), fill=col)
        d.ellipse((cx + 5 * u, by1 + 95 * u, cx + 16 * u, by1 + 100 * u), fill=col)
    a = np.asarray(sil).astype(np.float32) / 255
    # its outline, darker, so the edges guide the painting
    import cv2
    edge = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((5, 5), np.uint8)) > 0
    arr = np.asarray(im).astype(np.float32) / 255
    arr[edge] = np.array(line, np.float32) / 255
    t.rgb = arr
    return a


def statue(p: Painter | None):
    cam, img = load_capture('packaging')
    h, w = img.shape[:2]
    (bx0, by0, bx1, by1), box_dist = screen_box(cam, 'Shipping_Box', w, h)
    (sx0, sy0, sx1, sy1), _ = screen_box(cam, 'Shopping_Stand', w, h)
    t = frame_tex('packaging', img)
    bw, bh = bx1 - bx0, by1 - by0
    # where he may stand: under and around the box, down to the pedestal's top (about 69% of the frame's height)
    top_y = int(h * 0.69)
    keep = rect(t, (int(bx0 - 2), int(by0 - 2), int(bx1 + 2), int(by1 + 2)))  # the 3D box stays the real one
    sil = guide(t, (bx0, by0, bx1, by1), top_y)
    mask = np.clip(grow(sil, int(w * 0.02)) * (1 - keep), 0, 1)
    if p is not None:
        p.paint(t, feather(mask, 3), PROMPT, strength=0.94, control=0.45, control_end=0.6, steps=36, guidance=7.5, seed=SEED,
                area=int(os.environ.get('RAPHAEL_CARVE_AREA', 896 * 896)), feather_px=3, style=STYLE,
                negative='animal, cheetah, leopard, cat, back view, from behind, wings on the back, headless, box on the head, stocky, ' + CARVE_NEG,
                tag=f'hermes-{SEED}')
    # where the guide's dark outline survived the painting (thin dark strokes on the stone), filled from around them
    import cv2
    edge = cv2.morphologyEx((sil > 0.5).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((5, 5), np.uint8))
    edge = cv2.dilate(edge, np.ones((5, 5), np.uint8)) * (mask > 0.5)
    lum = cv2.cvtColor(np.clip(t.rgb, 0, 1).astype(np.float32), cv2.COLOR_RGB2Lab)[..., 0]
    near = cv2.blur(lum, (15, 15))
    fix = ((edge > 0) & (lum < near - 14)).astype(np.uint8)
    fix = cv2.dilate(fix, np.ones((3, 3), np.uint8))
    t.rgb = cv2.inpaint((np.clip(t.rgb, 0, 1) * 255).astype(np.uint8), fix * 255, 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
    out = SRC / 'packaging' / 'hermes'
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(t.rgb, 0, 1) * 255).astype(np.uint8)).save(out / f'painted-{SEED}.png')
    d = depth(t.rgb)
    # (a margin round the real box on its sides and top: no painted copy of its faces may stay in the relief; none
    # below it, where his hands hold it)
    m = int(w * 0.012)
    margin = rect(t, (int(bx0 - m), int(by0 - m), int(bx1 + m), int(by1 + 2)))
    a = cutout(d, mask, margin, seed_pt=((bx0 + bx1) / 2, (by1 + top_y) / 2))
    a[int(top_y + h * 0.004):] = 0  # nothing below the pedestal's top line (the painting's shadow under his plinth)
    Image.fromarray((a * 255).astype(np.uint8)).save(out / f'alpha-{SEED}.png')
    # a sculpture about as deep as the box he holds is wide (the box's own size in the scene)
    wx = [q['world'][0] for q in cam['boxes']['Shipping_Box']]
    wz = [q['world'][2] for q in cam['boxes']['Shipping_Box']]
    box_w = max(max(wx) - min(wx), max(wz) - min(wz))
    raise_(cam, t.rgb, a, d, anchor_dist=box_dist, thickness=box_w * 1.1, out=out / 'relief', stride=3)
    write_glb(out / 'relief', ROOT / 'art' / 'scenes' / 'packaging' / 'hermes.glb', 'hermes')


if __name__ == '__main__':
    pedestal()
    statue(None if '--no-paint' in sys.argv else Painter())
