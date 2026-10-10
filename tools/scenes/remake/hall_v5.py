"""The partners' hall (v5): the founder's scene moves from Raphael's School of Athens (Greek, and nothing of the
partners in it) to an Egyptian temple hall, painted for the studio in the manner of the 19th-century Orientalist oil
paintings of Karnak: the great columns, carved and painted, light falling between them. The partners' names are then
set on the columns in gold (founder.py places them).

    py tools/scenes/remake/hall_v5.py cands [--seeds 91,92,93]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

from paint import Painter, Tex

OUT = Path('D:/RAhpel/.work-raphael/v5-art/hall')
W, H = 1344, 768  # wide (SDXL's own size for it)
PROMPT = ('the great hypostyle hall of an ancient Egyptian temple at Karnak, massive carved columns with hieroglyphs and '
          'faded painted colours, shafts of golden sunlight falling between the columns, warm dust in the air, deep '
          'perspective, wide view, 19th century Orientalist oil painting, David Roberts, masterpiece')
STYLE = 'oil on canvas, rich glazes, warm golden light, museum quality, highly detailed'
NEG = ('people, person, figure, crowd, tourists, text, letters, signature, watermark, frame, border, modern, photo, '
       'blurry, lowres, cartoon, 3d render')


class Canvas(Tex):
    def __init__(self, name: str):
        self.scene, self.name = 'hall-v5', name
        self.rgb = np.full((H, W, 3), 0.3, np.float32)
        self.alpha = np.ones((H, W), np.float32)
        self.h, self.w = H, W


def cands(seeds):
    p = Painter()
    (OUT / 'cands').mkdir(parents=True, exist_ok=True)
    for seed in seeds:
        c = Canvas('hall')
        p.paint(c, np.ones((H, W), np.float32), PROMPT, box=(0, 0, W, H), negative=NEG, style=STYLE, strength=1.0,
                control=0.0, steps=32, guidance=7.0, seed=seed, area=W * H, feather_px=0, tag='hall')
        Image.fromarray((np.clip(c.rgb, 0, 1) * 255).astype(np.uint8)).save(OUT / 'cands' / f'hall-{seed}.jpg', quality=90)
        print(f'  hall {seed}', flush=True)


if __name__ == '__main__':
    args = sys.argv[1:]
    seeds = [int(x) for x in (args[args.index('--seeds') + 1] if '--seeds' in args else '91,92,93,94').split(',')]
    if args and args[0] == 'cands':
        cands(seeds)
