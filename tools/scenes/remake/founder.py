"""v4: the founder in Raphael's School of Athens, a scene of its own (the partners section), built like the others: a
painted backdrop raised into a relief by its depth, a painted figure in front of it, a camera that moves with the
scroll and turns a little with the pointer.

  * the backdrop: The School of Athens (Raphael, 1509-1511, public domain) and its depth map (the arches far, the
    philosophers in the middle, the steps near), seen from the camera exactly as painted;
  * the founder: his portrait (the studio's photograph) painted in brunaille, the warm brown monochrome of a
    Renaissance underpainting, so he stays himself (his photograph is black and white) and belongs to the painting;
    framed from the knees up (the frame cuts him below the seat), in front of the steps, on the right;
  * both are written as GLBs (relief.mjs) in the scene's space; the scene's timeline is authored here (timeline()).

    py tools/scenes/remake/founder.py [--no-paint]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from paint import ROOT, SRC, Painter, Tex, feather, gradient_map, grow, lab, rect
from relief import depth, write_glb

MEDIA = ROOT / 'src' / 'assets' / 'media'
OUT = SRC / 'partners'
ART = ROOT / 'art' / 'scenes' / 'partners'
FOV = 30.0  # the camera at rest: at the origin, looking down -z
ASPECT = 1.6
BRUNAILLE = [(0.0, '#160e08'), (0.25, '#3b281a'), (0.5, '#6e5034'), (0.72, '#a68560'), (0.9, '#d9c19a'), (1.0, '#f4e8cf')]
# where the backdrop's crop sits in the painting (the view at rest): px of the 2600 x 2017 fresco
VIEW = (150, 170, 2450, 1608)
# the founder on the screen at rest: his figure's box, in screen fractions (x0, y0, x1, y1)
SEAT = (0.63, 0.40, 0.95, 1.30)  # (his knees below the frame's bottom even when the camera draws back)


def project(points_px, size, dist, view, w, h):
    """pixels of a picture laid over the view rectangle -> world points at the given camera distances"""
    tan = np.tan(np.radians(FOV) / 2)
    x0, y0, x1, y1 = view
    u = (points_px[..., 0] - x0) / (x1 - x0)
    v = (points_px[..., 1] - y0) / (y1 - y0)
    nx = u * 2 - 1
    ny = 1 - v * 2
    return np.stack([nx * dist * tan * ASPECT, ny * dist * tan, -dist], -1)


def mesh_from(points, alpha_ok, uvs, jump=None, dist=None):
    """a grid of world points -> positions, uvs, triangles (cells with all four corners kept)"""
    gh, gw = alpha_ok.shape
    idx = -np.ones((gh, gw), np.int64)
    pos, uv = [], []
    for j in range(gh):
        for i in range(gw):
            if not alpha_ok[j, i]:
                continue
            idx[j, i] = len(pos)
            pos.append(points[j, i].tolist())
            uv.append(uvs[j, i].tolist())
    tris = []
    for j in range(gh - 1):
        for i in range(gw - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i], idx[j + 1, i + 1]]
            if min(q) < 0:
                continue
            if jump is not None and dist is not None:
                zs = [dist[j, i], dist[j, i + 1], dist[j + 1, i], dist[j + 1, i + 1]]
                if max(zs) - min(zs) > jump:
                    continue
            tris += [int(q[0]), int(q[2]), int(q[1]), int(q[1]), int(q[2]), int(q[3])]
    return {'positions': pos, 'uvs': uv, 'indices': tris}


def backdrop():
    """the fresco as a relief: each pixel pushed back along its ray by the depth map (near 7, far 13)"""
    # (KTX2 wants sides in multiples of 4: the fresco at 2048 x 1588, its proportions kept)
    img = Image.open(MEDIA / 'school-of-athens.jpg').convert('RGB')
    sx = 2048 / img.width
    img = img.resize((2048, 1588), Image.LANCZOS)
    W, H = img.size
    dmap = np.asarray(Image.open(MEDIA / 'school-of-athens.depth.png').convert('L').resize((W, H), Image.BICUBIC)).astype(np.float32) / 255
    dmap = cv2.GaussianBlur(dmap, (0, 0), 6)
    stride = 10
    gy, gx = np.mgrid[0:H + 1:stride, 0:W + 1:stride].astype(np.float32)
    gx = np.minimum(gx, W - 1)
    gy = np.minimum(gy, H - 1)
    d = dmap[gy.astype(int), gx.astype(int)]
    dist = 7.0 + (1 - d) * 6.0
    view = tuple(v * sx for v in VIEW)
    pts = project(np.stack([gx, gy], -1), (W, H), dist, view, W, H)
    uvs = np.stack([gx / (W - 1), gy / (H - 1)], -1)
    m = mesh_from(pts, np.ones_like(d, bool), uvs)
    folder = OUT / 'backdrop'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'mesh.json').write_text(json.dumps(m))
    img.convert('RGBA').save(folder / 'texture.png')
    write_glb(folder, ART / 'backdrop.glb', 'school-of-athens')


def painted_founder(paint: bool) -> tuple[np.ndarray, np.ndarray]:
    """his portrait in brunaille (RGB 0..1) and its alpha, the chair turned to marble"""
    photo = np.asarray(Image.open(MEDIA / 'founder.jpg').convert('RGB')).astype(np.float32) / 255
    alpha = np.asarray(Image.open(MEDIA / 'founder.subject.png').convert('RGBA'))[..., 3].astype(np.float32) / 255
    t = Tex.__new__(Tex)
    t.scene, t.name = 'partners', 'founder'
    t.rgb, t.alpha = photo.copy(), alpha.copy()
    t.h, t.w = photo.shape[:2]
    ys, xs = np.nonzero(alpha > 0.5)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    seat_y = y0 + int((y1 - y0) * 0.70)  # his seat (the chair below it is left out of the picture)
    if paint:
        p = Painter()
        p.paint(t, feather(grow(alpha, 6), 3), 'portrait of a bald man with a short grey beard and dark sunglasses, in a dark suit '
                'and an open white shirt, seated, his hands clasped, a wristwatch', strength=0.36, control=0.8, seed=61,
                style='Renaissance brunaille oil painting, warm brown monochrome underpainting, old master portrait, fine brushwork',
                negative='colour, blue, green, red, photo, 3d render, cartoon, text, logo, watermark, deformed, extra fingers',
                tag='founder', area=1024 * 1024)
    # one warm monochrome over the figure (brunaille)
    gradient_map(t, grow(alpha, 2), BRUNAILLE, keep=0.0, keep_l=0.12, lo=0.5, hi=99.5, gamma=0.92)
    # a seated portrait, framed from the knees up: the figure ends a little below the seat, the frame cuts it there
    a = alpha.copy()
    cut = seat_y + int((y1 - y0) * 0.06)
    a[cut:] = 0
    return t.rgb, a


def founder(paint: bool):
    rgb, a = painted_founder(paint)
    h, w = a.shape
    folder = OUT / 'founder'
    folder.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.dstack([np.clip(rgb, 0, 1), a]) * 255).astype(np.uint8), 'RGBA').save(folder / 'painted.png')
    d = depth(rgb * a[..., None] + (1 - a[..., None]) * 0.5)
    ys, xs = np.nonzero(a > 0.5)
    fx0, fy0, fx1, fy1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    # his figure's box -> the seat on screen (SEAT), the picture's pixels -> screen fractions
    sx0, sy0, sx1, sy1 = SEAT
    scale = (sy1 - sy0) / (fy1 - fy0)
    stride = 4
    gy, gx = np.mgrid[fy0 - 8:fy1 + 8:stride, fx0 - 8:fx1 + 8:stride].astype(np.float32)
    gx = np.clip(gx, 0, w - 1)
    gy = np.clip(gy, 0, h - 1)
    u = sx0 + (gx - fx0) * scale / ASPECT  # screen x fraction (square pixels: x scaled by the aspect)
    v = sy0 + (gy - fy0) * scale
    inside = cv2.dilate((a > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8))[gy.astype(int), gx.astype(int)] > 0
    dd = cv2.GaussianBlur(d, (0, 0), 4)[gy.astype(int), gx.astype(int)]
    centre = float(np.median(dd[inside]))
    dist = 4.6 + (centre - dd) * 0.55
    tan = np.tan(np.radians(FOV) / 2)
    pts = np.stack([(u * 2 - 1) * dist * tan * ASPECT, (1 - v * 2) * dist * tan, -dist], -1)
    cx0, cy0, cx1, cy1 = fx0 - 8, fy0 - 8, fx1 + 8, fy1 + 8
    crop = np.dstack([np.clip(rgb, 0, 1), feather(a, 1.0)])[max(0, cy0):cy1, max(0, cx0):cx1]
    uvs = np.stack([(gx - max(0, cx0)) / (crop.shape[1]), (gy - max(0, cy0)) / (crop.shape[0])], -1)
    m = mesh_from(pts, inside, uvs, jump=0.25, dist=dist)
    (folder / 'mesh.json').write_text(json.dumps(m))
    Image.fromarray((crop * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
    print(f'  founder relief: {len(m["positions"])} vertices', flush=True)
    write_glb(folder, ART / 'founder.glb', 'founder', 'breathe')


def timeline():
    """the scene's timeline (the format build.mjs makes from Theatre.js states): the camera comes close to the founder
    at first, then draws back into the hall; the pointer turns it a little (gaze); the founder breathes"""
    K = lambda p, v: [p, v, 0.5, 1, 0.5, 0, 0, 1]  # noqa: E731  (ease in-out keys)
    cam = {
        'static': {'gaze': 0.32, 'fov': FOV, 'rotation': {'x': 0, 'y': 0, 'z': 0}},
        'tracks': {
            'position.x': [K(0, 0.55), K(2.6, 0.0)],
            'position.y': [K(0, -0.25), K(2.6, 0.08)],
            'position.z': [K(0, -1.6), K(2.6, 0.9)],
            'target.x': [K(0, 0.9), K(2.6, 0.0)],
            'target.y': [K(0, -0.45), K(2.6, 0.0)],
            'target.z': [K(0, -5.0), K(2.6, -8.0)],
        },
    }
    objects = {
        'camera': cam,
        'asset-1': {'static': {}, 'tracks': {}},
        'asset-2': {'static': {'animations': {'breathe': {'loop': True}}}, 'tracks': {}},
        'effects': {'static': {'bloom': {'intensity': 1.6}}, 'tracks': {}},
    }
    ART.mkdir(parents=True, exist_ok=True)
    (ART / 'timeline.json').write_text(json.dumps({'length': 10, 'objects': objects}))
    print('  timeline written', flush=True)


if __name__ == '__main__':
    timeline()
    backdrop()
    founder('--no-paint' not in sys.argv)
