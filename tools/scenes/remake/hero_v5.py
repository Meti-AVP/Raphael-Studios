"""The hero, made anew (the studio's own scene; nothing of the reference's): two marble statues in a dark, holographic
Egypt. One is a photographer, his old press camera up to his eye; the other holds out the studio's bag, and when the
flash goes off, the bag spills the studio's work: a panorama of its pictures unfolding in the air, one of its shirts
and one of its boxes tumbling out.

This script paints the two figures (SDXL, full strength, on a plain black ground so they come away cleanly), picks
them out, and raises them into reliefs (relief.py, as the founder's), and writes the backdrop's holographic layers.
The scene's other pieces (the panorama, the shirt, the box, the flash) are built by hero_v5.mjs.

    py tools/scenes/remake/hero_v5.py cands [photographer|model] [--seeds 61,62,...]   candidates to choose from
    py tools/scenes/remake/hero_v5.py build                                              the chosen ones, as reliefs
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from paint import ROOT, SRC, Painter, Tex, feather
from statue import CARVE_NEG

OUT = SRC.parent / 'v5-art' / 'hero'
ART = ROOT / 'art' / 'scenes' / 'hero-v5'
W, H = 832, 1216  # portrait, SDXL's own size for it

STYLE = 'white marble sculpture, Baroque, Bernini, dramatic light from the left, pure black background, museum photograph'
NEG = (CARVE_NEG + ', pedestal, plinth, base, column, wall, floor, ground, sky, clouds, grey background, scenery, frame, '
       'border, two people, crowd, extra limbs, extra arms, extra hands, missing hands, deformed hands, cropped, cut off, '
       'modern clothes, jeans, smartphone')

# (the action first: CLIP weighs the start of a prompt most, and stops at 77 tokens)
FIGURES = {
    'photographer': ('marble statue of a photographer holding a vintage camera up to his eye with both hands, taking a '
                     'picture, the camera has a big round flash reflector, a young Greek man in flowing drapery, full '
                     'figure in profile facing right, floating, on a black background'),
    'model': ('marble statue of a young Greek woman holding up a red shopping bag by its handles in her raised hand, '
              'posing for a photo, flowing drapery, full figure facing left, floating, on a black background'),
}


class Canvas(Tex):
    """a blank picture to paint a figure into"""

    def __init__(self, name: str):
        self.scene, self.name = 'hero-v5', name
        self.rgb = np.full((H, W, 3), 0.02, np.float32)
        self.alpha = np.ones((H, W), np.float32)
        self.h, self.w = H, W


def cands(which: list[str], seeds: list[int]):
    p = Painter()
    (OUT / 'cands').mkdir(parents=True, exist_ok=True)
    for name in which:
        for seed in seeds:
            c = Canvas(name)
            p.paint(c, np.ones((H, W), np.float32), FIGURES[name], box=(0, 0, W, H), negative=NEG, style=STYLE,
                    strength=1.0, control=0.0, steps=30, guidance=7.5, seed=seed, area=W * H, feather_px=0,
                    tag=f'hero-{name}')
            Image.fromarray((np.clip(c.rgb, 0, 1) * 255).astype(np.uint8)).save(OUT / 'cands' / f'{name}-{seed}.jpg', quality=90)
            print(f'  {name} {seed}', flush=True)
    sheet(which, seeds)


def sheet(which, seeds):
    tiles = []
    for name in which:
        for seed in seeds:
            f = OUT / 'cands' / f'{name}-{seed}.jpg'
            if f.exists():
                im = Image.open(f)
                im.thumbnail((300, 440))
                tiles.append((f'{name}-{seed}', im))
    cols = min(6, max(1, len(tiles)))
    rows = (len(tiles) + cols - 1) // cols
    s = Image.new('RGB', (cols * 300, rows * 460), 'white')
    from PIL import ImageDraw
    for k, (label, im) in enumerate(tiles):
        x, y = (k % cols) * 300, (k // cols) * 460
        s.paste(im, (x, y))
        ImageDraw.Draw(s).text((x + 6, y + 442), label, fill='black')
    s.save(OUT / 'cands' / 'sheet.jpg', quality=85)
    print(OUT / 'cands' / 'sheet.jpg')


def outpaint_model(src: str = 'model-74.jpg', extra: int = 384, seed: int = 81):
    """the model's painting widened on the side her hand reaches out to (the hand and the handles, cut off by the
    painting's edge, painted whole), then mirrored: she faces the photographer"""
    im = np.asarray(Image.open(OUT / 'cands' / src).convert('RGB')).astype(np.float32) / 255
    h, w = im.shape[:2]
    ground = np.median(np.concatenate([im[:40, :40].reshape(-1, 3), im[:40, -40:].reshape(-1, 3)]), axis=0)
    wide = np.ones((h, w + extra, 3), np.float32) * ground
    wide[:, :w] = im
    c = Canvas('model-wide')
    c.rgb, c.alpha, c.w = wide, np.ones((h, w + extra), np.float32), w + extra
    mask = np.zeros((h, w + extra), np.float32)
    mask[:, w - 40:] = 1
    p = Painter()
    p.paint(c, feather(mask, 6), 'the marble hand of a statue holding the two rope handles of a red paper shopping bag, '
            'the rest of her outstretched arm, plain grey background', box=(w - 420, 0, w + extra, h), negative=NEG,
            style=STYLE, strength=1.0, control=0.0, steps=32, guidance=7.0, seed=seed, area=(420 + extra) * h,
            feather_px=8, tag='hero-model-wide')
    out = np.clip(c.rgb[:, ::-1], 0, 1)  # mirrored: she looks left, towards the photographer
    Image.fromarray((out * 255).astype(np.uint8)).save(OUT / 'cands' / 'model-wide.jpg', quality=92)
    print(OUT / 'cands' / 'model-wide.jpg')


def clean_model(seed: int = 83):
    """the widened, mirrored model without the painted bag (the scene hangs the studio's own bag, in 3D, from her
    hand) and without the second hand the widening added: both painted over as the plain ground, the hand's curled
    fingers kept"""
    im = np.asarray(Image.open(OUT / 'cands' / 'model-wide.jpg').convert('RGB')).astype(np.float32) / 255
    h, w = im.shape[:2]
    hsv = cv2.cvtColor((im * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    red = (((hsv[..., 0] < 12) | (hsv[..., 0] > 168)) & (hsv[..., 1] > 90) & (hsv[..., 2] > 50)).astype(np.float32)
    red = cv2.dilate(red, np.ones((15, 15), np.uint8))
    mask = red.copy()
    mask[:, :392] = 1  # the extra hand (and the widened ground beyond hers)
    c = Canvas('model-clean')
    c.rgb, c.alpha, c.w, c.h = im.copy(), np.ones((h, w), np.float32), w, h
    p = Painter()
    p.paint(c, feather(mask, 4), 'plain grey studio background, the marble fingers of a statue curled around a thin cord',
            box=(0, 150, 760, 900), negative=NEG + ', bag, red, hand, fingers, arm', style=STYLE, strength=1.0, control=0.0,
            steps=32, guidance=7.0, seed=seed, area=760 * 750, feather_px=6, tag='hero-model-clean')
    Image.fromarray((np.clip(c.rgb, 0, 1) * 255).astype(np.uint8)).save(OUT / 'cands' / 'model-clean.jpg', quality=92)
    print(OUT / 'cands' / 'model-clean.jpg')


if __name__ == '__main__':
    args = sys.argv[1:]
    cmd = args[0] if args else 'cands'
    seeds = [int(x) for x in (args[args.index('--seeds') + 1] if '--seeds' in args else '61,62,63,64,65,66').split(',')]
    if cmd == 'cands':
        which = [a for a in args[1:] if a in FIGURES] or list(FIGURES)
        cands(which, seeds)
    elif cmd == 'outpaint':
        outpaint_model()
    elif cmd == 'clean':
        clean_model()
    elif cmd == 'sheet':
        which = [a for a in args[1:] if a in FIGURES] or list(FIGURES)
        sheet(which, seeds)
