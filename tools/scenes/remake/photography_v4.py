"""v4: the photography chapter's scene, built like the founder's (founder.py): Raphael's Portrait of Baldassare
Castiglione (c. 1514-1515, Louvre, public domain) as a sitting in the studio. The painting is parted by its depth into
the sitter and his ground: the ground (the painting's own wall, widened for the screen) far back, the sitter raised
into a relief in front of it, right of the centre; the camera steps in to him with the scroll, as a photographer does
for the portrait, the pointer turns it a little, and he breathes.

    py tools/scenes/remake/photography_v4.py

Source: D:/RAhpel/.work-raphael/art/castiglione.jpg (Wikimedia Commons, C2RMF retouched; env RAPHAEL_ART).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from founder import ASPECT, FOV, mesh_from
from paint import ROOT, SRC, feather
from relief import depth, write_glb

PAINTING = Path(os.environ.get('RAPHAEL_ART', 'D:/RAhpel/.work-raphael/art')) / 'castiglione.jpg'
OUT = SRC / 'photography'
ART = ROOT / 'art' / 'scenes' / 'photography'
# the sitter on the screen at rest: the painting's box (x0, y0, x1, y1) in screen fractions; his hands go below the
# frame's bottom (the painting cuts him there too)
SITTER = (0.40, 0.02, 0.98, 1.14)
GROUND_DIST = 12.0
SITTER_DIST = 5.2


def load() -> np.ndarray:
    img = Image.open(PAINTING).convert('RGB')
    h = 1800
    img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32) / 255
    # the canvas's dark edge (the scan shows the stretcher's border): trimmed
    m = 18
    return a[m:-m, m:-m].copy()


def sitter_mask(d: np.ndarray) -> np.ndarray:
    """the sitter: what stands in front of the wall. The wall's depth is fitted as a smooth surface over what is surely
    wall (the band above his hat, the two sides down to his shoulders); he is what is nearer than it by a margin"""
    h, w = d.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    wall = np.zeros((h, w), bool)
    wall[:int(h * 0.08)] = True
    k = int(w * 0.04)
    wall[:int(h * 0.62), :k] = True
    wall[:int(h * 0.62), -k:] = True
    terms = lambda x, y: [x, y, x * y, x * x, y * y, np.ones_like(x)]  # noqa: E731
    coef, *_ = np.linalg.lstsq(np.stack(terms(xx[wall], yy[wall]), 1), d[wall], rcond=None)
    bg = sum(c * t for c, t in zip(coef, terms(xx, yy)))
    m = (d > bg + 0.08).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(m)
    m = (lbl == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    # holes (between an arm and the body): filled, unless they reach the border
    flood = np.pad(m, 1).copy()
    cv2.floodFill(flood, np.zeros((h + 4, w + 4), np.uint8), (0, 0), 1)
    m = m | (1 - flood[1:-1, 1:-1])
    return feather(m.astype(np.float32), 1.5)


def ground(img: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """the wall behind him, as wide as the screen: its colour and light fitted over the wall the painting shows (a
    smooth plane, carried flat beyond the painting's sides), its canvas grain taken from a clear piece of that wall
    and laid over all of it (turned and flipped so it does not repeat to the eye), darker towards the edges"""
    h, w = alpha.shape
    wall = cv2.dilate((alpha > 0.1).astype(np.uint8), np.ones((41, 41), np.uint8)) == 0
    wall[:30], wall[-30:], wall[:, :30], wall[:, -30:] = False, False, False, False
    terms = lambda x, y: [np.ones_like(x), x, y]  # noqa: E731  (a plane: nothing wild where no wall is seen)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    A = np.stack(terms(xx[wall] / w, yy[wall] / h), 1)
    smooth_img = cv2.GaussianBlur(img, (0, 0), 10)
    coef = [np.linalg.lstsq(A, smooth_img[..., c][wall], rcond=None)[0] for c in range(3)]
    W = int(round(h * 2.4))
    W -= W % 4
    left = int(W * 0.5 - w * 0.2)
    Y, X = np.mgrid[0:h, 0:W].astype(np.float32)
    xp = np.clip((X - left) / w, 0.02, 0.98)
    yp = Y / h
    base = np.dstack([sum(c * t for c, t in zip(coef[ch], terms(xp, yp))) for ch in range(3)])
    lo, hi = np.percentile(smooth_img[wall], 3, axis=0), np.percentile(smooth_img[wall], 97, axis=0)
    base = np.clip(base, lo, hi)
    # the grain: a clear square of wall (left of him, a third of the way down), its fine detail only
    ys, xs = np.nonzero(wall[:, :w // 3])
    n = 256
    y0 = int(np.clip(np.median(ys) - n / 2, 30, h - n - 30))
    x0 = int(np.clip(np.median(xs) - n / 2, 30, w // 3 - n))
    patch = img[y0:y0 + n, x0:x0 + n]
    fine = patch - cv2.GaussianBlur(patch, (0, 0), 4)
    rng = np.random.default_rng(3)
    grain = np.zeros((h, W, 3), np.float32)
    for ty in range(0, h, n):
        for tx in range(0, W, n):
            t = np.rot90(fine, int(rng.integers(4)))
            if rng.random() < 0.5:
                t = t[:, ::-1]
            grain[ty:ty + n, tx:tx + n] = t[:min(n, h - ty), :min(n, W - tx)]
    out = base + grain * 0.9
    d = np.sqrt(((X - W * 0.56) / (W * 0.62)) ** 2 + ((Y - h * 0.45) / (h * 0.9)) ** 2)
    out *= np.clip(1.12 - d * 0.42, 0.55, 1.0)[..., None]
    return np.clip(out, 0, 1)


def plane(folder: Path, rgb: np.ndarray, dist: float, cover: float, name: str):
    """a picture as a flat card facing the camera, filling `cover` times the view at rest (camera moves need margin)"""
    h, w = rgb.shape[:2]
    tan = np.tan(np.radians(FOV) / 2)
    half_h = dist * tan * cover
    half_w = half_h * w / h
    gy, gx = np.mgrid[0:9, 0:9].astype(np.float32) / 8
    pts = np.stack([(gx * 2 - 1) * half_w, (1 - gy * 2) * half_h, np.full_like(gx, -dist)], -1)
    uvs = np.stack([gx, gy], -1)
    m = mesh_from(pts, np.ones(gx.shape, bool), uvs)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'mesh.json').write_text(json.dumps(m))
    Image.fromarray((np.dstack([rgb, np.ones(rgb.shape[:2])]) * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
    write_glb(folder, ART / f'{name}.glb', name)


def sitter(img: np.ndarray, alpha: np.ndarray, d: np.ndarray):
    """the sitter raised by his depth, his painting's box placed at SITTER on the screen; where the painting's own edges
    cut him (his arm at the right, his hands at the bottom) he fades into the wall, as a vignetted portrait does, so
    no straight cut shows when the camera draws back"""
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    fade = np.clip((w - xx) / (0.16 * w), 0, 1) ** 1.6 * np.clip((h - yy) / (0.12 * h), 0, 1) ** 1.6
    fade *= np.clip(xx / (0.06 * w), 0, 1)
    body = alpha > 0.5  # the mesh covers all of him; the fade is in the picture's alpha
    alpha = alpha * fade
    sx0, sy0, sx1, sy1 = SITTER
    scale = (sy1 - sy0) / h  # screen heights per painting pixel
    stride = 5
    gy, gx = np.mgrid[0:h:stride, 0:w:stride].astype(np.float32)
    u = sx0 + gx * scale / ASPECT
    v = sy0 + gy * scale
    inside = cv2.dilate(body.astype(np.uint8), np.ones((9, 9), np.uint8))[gy.astype(int), gx.astype(int)] > 0
    dd = cv2.GaussianBlur(d, (0, 0), 5)[gy.astype(int), gx.astype(int)]
    centre = float(np.median(dd[inside]))
    dist = SITTER_DIST + (centre - dd) * 0.7
    tan = np.tan(np.radians(FOV) / 2)
    pts = np.stack([(u * 2 - 1) * dist * tan * ASPECT, (1 - v * 2) * dist * tan, -dist], -1)
    uvs = np.stack([gx / w, gy / h], -1)
    m = mesh_from(pts, inside, uvs, jump=0.3, dist=dist)
    folder = OUT / 'sitter'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'mesh.json').write_text(json.dumps(m))
    Image.fromarray((np.dstack([img, feather(alpha, 1.0)]) * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
    print(f'  sitter relief: {len(m["positions"])} vertices', flush=True)
    write_glb(folder, ART / 'sitter.glb', 'castiglione', 'breathe')


def timeline():
    """the camera begins close to him and a little low, then draws back to the whole sitting; the pointer turns it a
    little (gaze); he breathes"""
    K = lambda p, v: [p, v, 0.5, 1, 0.5, 0, 0, 1]  # noqa: E731  (ease in-out keys)
    cam = {
        'static': {'gaze': 0.3, 'fov': FOV, 'rotation': {'x': 0, 'y': 0, 'z': 0}},
        'tracks': {
            'position.x': [K(0, 0.5), K(2.6, 0.05)],
            'position.y': [K(0, 0.1), K(2.6, -0.02)],
            'position.z': [K(0, -1.5), K(2.6, 0.7)],
            'target.x': [K(0, 0.95), K(2.6, 0.15)],
            'target.y': [K(0, 0.25), K(2.6, 0.0)],
            'target.z': [K(0, -5.2), K(2.6, -8.0)],
        },
    }
    objects = {
        'camera': cam,
        'asset-1': {'static': {}, 'tracks': {}},
        'asset-2': {'static': {'animations': {'breathe': {'loop': True}}}, 'tracks': {}},
        'effects': {'static': {'bloom': {'intensity': 1.2}}, 'tracks': {}},
    }
    ART.mkdir(parents=True, exist_ok=True)
    (ART / 'timeline.json').write_text(json.dumps({'length': 10, 'objects': objects}))
    print('  timeline written', flush=True)


def main():
    img = load()
    d = depth(img)
    alpha = sitter_mask(d)
    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray((alpha * 255).astype(np.uint8)).save(OUT / 'alpha.png')
    Image.fromarray((d * 255).astype(np.uint8)).save(OUT / 'depth.png')
    g = ground(img, alpha)
    Image.fromarray((g * 255).astype(np.uint8)).save(OUT / 'ground.jpg', quality=88)
    timeline()
    plane(OUT / 'ground', cv2.resize(g, (2048, int(round(2048 * g.shape[0] / g.shape[1] / 4)) * 4), interpolation=cv2.INTER_AREA),
          GROUND_DIST, 1.45, 'ground')
    sitter(img, alpha, d)


if __name__ == '__main__':
    main()
