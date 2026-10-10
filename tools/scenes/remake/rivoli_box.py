"""The Rivoli box (one of the studio's packaging jobs: media/packaging-stack.jpg) as a texture for a 3D box: the
envelope face as photographed (its flap, the gold Rivoli wordmark, the roses at its corners), the ends from the same
face's rose corners on the purple board, the lid and the base the plain purple board with its fine grain.

Layout (one 1024 x 1024 atlas, faces in rows; hero_v5.mjs maps a box onto it):
    front  [0, 0, 1024, 528]       the envelope face (also the back)
    end    [0, 528, 512, 800]      the short ends (rose corner + purple)
    lid    [512, 528, 1024, 872]   the top and the base (plain board)

    py tools/scenes/remake/rivoli_box.py
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'src' / 'assets' / 'media' / 'packaging-stack.jpg'
OUT = Path('D:/RAhpel/.work-raphael/v5-art/hero/rivoli-atlas.png')
FACE = (632, 494, 1108, 739)  # the top box's envelope face, as photographed (nearly square-on)


def main():
    img = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32) / 255
    x0, y0, x1, y1 = FACE
    face = img[y0:y1, x0:x1]
    # the board's purple: the face's median away from the flowers and the wordmark
    board = np.median(face[20:90, 60:200].reshape(-1, 3), axis=0)
    atlas = np.ones((1024, 1024, 3), np.float32) * board
    grain = (np.random.default_rng(5).normal(0, 0.012, (1024, 1024, 1))).astype(np.float32)
    grain = cv2.GaussianBlur(grain, (0, 0), 0.7)[..., None]
    atlas = np.clip(atlas + grain, 0, 1)
    front = cv2.resize(face, (1024, 528), interpolation=cv2.INTER_CUBIC)
    # a touch of sharpening (the photo was upscaled)
    blur = cv2.GaussianBlur(front, (0, 0), 1.2)
    front = np.clip(front + (front - blur) * 0.6, 0, 1)
    atlas[0:528] = front
    # the ends: the face's left rose corner, on the board, filling a 512 x 272 end
    corner = face[:, :150]
    end = np.ones((272, 512, 3), np.float32) * board
    c = cv2.resize(corner, (int(150 * 272 / face.shape[0]), 272), interpolation=cv2.INTER_CUBIC)
    end[:, :c.shape[1]] = c
    end[:, -c.shape[1]:] = c[:, ::-1]
    atlas[528:800, 0:512] = np.clip(end + grain[528:800, 0:512], 0, 1)
    # the lid and the base: plain board, a soft fold line where the envelope flap meets it
    lid = np.ones((344, 512, 3), np.float32) * board
    lid[:, 254:258] *= 0.82
    atlas[528:872, 512:1024] = np.clip(lid + grain[528:872, 512:1024], 0, 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((atlas * 255 + 0.5).astype(np.uint8)).save(OUT)
    print(OUT, 'board', (board * 255).round())


if __name__ == '__main__':
    main()
