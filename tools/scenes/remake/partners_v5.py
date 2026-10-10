"""v5: the partners' scene. The founder (founder.py: his own photograph in brunaille, breathing) now stands in an
Egyptian temple hall painted for the studio (hall_v5.py: a hypostyle hall in the manner of the Orientalist paintings of
Karnak), and the brands that trust the studio are set in gold on its columns, each one appearing with the scenes'
burning edge as the reader scrolls (one asset each, its visibility on the timeline).

    py tools/scenes/remake/partners_v5.py
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from founder import ASPECT, FOV, founder, mesh_from
from paint import ROOT
from relief import depth, write_glb

HALL = Path('D:/RAhpel/.work-raphael/v5-art/hall/cands/hall-93.jpg')
OUT = Path('D:/RAhpel/.work-raphael/v5-art/hall')
ART = ROOT / 'art' / 'scenes' / 'partners'
LOGOS = ROOT / 'src' / 'assets' / 'logos'
TAN = np.tan(np.radians(FOV) / 2)
# the brands set on the columns (none a stricter market would hide), and where: the painting's pixels (1344 x 768)
BRANDS = [
    ('totalenergies', (178, 292)),
    ('toyota', (186, 468)),
    ('orange', (352, 300)),
    ('rixos', (334, 468)),
    ('concentrix', (522, 236)),
    ('virgin-megastore', (522, 420)),
    ('domty', (832, 248)),
]
PLAQUE = 0.62  # a plaque's width on its column (m)


def backdrop() -> tuple[np.ndarray, callable]:
    """the hall as a relief: each pixel pushed back by its depth (near 7, far 13); the painting fills the view's width"""
    img = Image.open(HALL).convert('RGB')
    W0, H0 = img.size
    w = 2048
    h = int(round(H0 * w / W0 / 4)) * 4
    img = img.resize((w, h), Image.LANCZOS)
    rgb = np.asarray(img).astype(np.float32) / 255
    blur = cv2.GaussianBlur(rgb, (0, 0), 1.2)
    rgb = np.clip(rgb + (rgb - blur) * 0.5, 0, 1)  # (the painting was made at half this size: a little crispness back)
    d = cv2.GaussianBlur(depth(rgb), (0, 0), 6)
    # the view at rest takes the middle three quarters of the painting's width (the camera draws back as the reader
    # scrolls: the painting still fills the screen then); its height is the view's (centred)
    vw = w * 0.74
    vh = vw / ASPECT
    view = ((w - vw) / 2, (h - vh) / 2, (w + vw) / 2, (h + vh) / 2)

    def at(px, py, toward=0.0):
        x0, y0, x1, y1 = view
        u = (px - x0) / (x1 - x0)
        v = (py - y0) / (y1 - y0)
        z = 7.0 + (1 - float(d[int(np.clip(py, 0, h - 1)), int(np.clip(px, 0, w - 1))])) * 6.0 - toward
        return [float((u * 2 - 1) * z * TAN * ASPECT), float((1 - v * 2) * z * TAN), -z]

    stride = 10
    gy, gx = np.mgrid[0:h + 1:stride, 0:w + 1:stride].astype(np.float32)
    gx = np.minimum(gx, w - 1)
    gy = np.minimum(gy, h - 1)
    dd = d[gy.astype(int), gx.astype(int)]
    dist = 7.0 + (1 - dd) * 6.0
    x0, y0, x1, y1 = view
    u = (gx - x0) / (x1 - x0)
    v = (gy - y0) / (y1 - y0)
    pts = np.stack([(u * 2 - 1) * dist * TAN * ASPECT, (1 - v * 2) * dist * TAN, -dist], -1)
    m = mesh_from(pts, np.ones(dd.shape, bool), np.stack([gx / (w - 1), gy / (h - 1)], -1))
    folder = OUT / 'backdrop'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'mesh.json').write_text(json.dumps(m))
    Image.fromarray((np.dstack([rgb, np.ones((h, w))]) * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
    write_glb(folder, ART / 'backdrop.glb', 'paint-hall')
    return rgb, at, w / W0


def gold(name: str) -> np.ndarray:
    """a brand's plaque: dark bronze, a fine gold border, the logo inlaid in gold (its gradient, a bevel lit from the
    upper left), as the plaques of a museum's benefactors"""
    im = Image.open(LOGOS / f'{name}.png').convert('RGBA')
    W, H = 640, 400
    logo = im.copy()
    logo.thumbnail((int(W * 0.74), int(H * 0.62)), Image.LANCZOS)
    a = np.zeros((H, W), np.float32)
    x0, y0 = (W - logo.width) // 2, (H - logo.height) // 2
    a[y0:y0 + logo.height, x0:x0 + logo.width] = np.asarray(logo)[..., 3].astype(np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = yy / H
    stops = [(0.0, (0.98, 0.88, 0.55)), (0.45, (0.82, 0.60, 0.22)), (0.62, (0.64, 0.44, 0.13)), (1.0, (0.95, 0.80, 0.42))]
    goldc = np.zeros((H, W, 3), np.float32)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        k = np.clip((t - t0) / (t1 - t0), 0, 1)[..., None]
        inside = ((t >= t0) & (t <= t1))[..., None]
        goldc = np.where(inside, np.array(c0) * (1 - k) + np.array(c1) * k, goldc)
    sa = cv2.GaussianBlur(a, (0, 0), 1.6)
    light = np.clip(-(cv2.Sobel(sa, cv2.CV_32F, 1, 0, ksize=3) + cv2.Sobel(sa, cv2.CV_32F, 0, 1, ksize=3)) * 0.9, -0.5, 0.6)[..., None]
    goldc = np.clip(goldc * (1 + light), 0, 1)
    # the plaque: a rounded rectangle of dark bronze, lit a little at its top, a gold border inset
    r = 34
    qx = np.maximum(np.abs(xx - W / 2) - (W / 2 - r), 0)
    qy = np.maximum(np.abs(yy - H / 2) - (H / 2 - r), 0)
    dist = np.hypot(qx, qy) - r  # < 0 inside
    plate = np.clip(-dist / 1.5, 0, 1)
    bronze = np.array([0.17, 0.11, 0.06]) * (1.15 - t[..., None] * 0.35)
    border = np.clip(1 - np.abs(dist + 16) / 2.2, 0, 1)[..., None]
    rgb = bronze * (1 - border) + goldc * border
    rgb = rgb * (1 - a[..., None]) + goldc * a[..., None]
    return np.dstack([np.clip(rgb, 0, 1), plate])


def plaques(at):
    """each brand on its column, a hair in front of it, facing the camera"""
    for i, (name, (px, py)) in enumerate(BRANDS):
        tex = gold(name)
        h, w = tex.shape[:2]
        c = at(px * 2048 / 1344, py * 2048 / 1344, toward=0.16)
        hw = PLAQUE / 2
        hh = hw * h / w
        # a flat card at c, turned to face the camera at the origin
        z = np.array(c) / -np.linalg.norm(c)
        x = np.cross([0, 1, 0], z)
        x /= np.linalg.norm(x)
        y = np.cross(z, x)
        corners = [np.array(c) + sx * hw * x + sy * hh * y for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
        m = {'positions': [p.tolist() for p in corners], 'uvs': [[0, 1], [1, 1], [1, 0], [0, 0]], 'indices': [0, 1, 2, 0, 2, 3]}
        folder = OUT / f'logo-{name}'
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'mesh.json').write_text(json.dumps(m))
        Image.fromarray((np.clip(tex, 0, 1) * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
        write_glb(folder, ART / f'logo-{i + 1}.glb', f'paint-logo-{name}')


def timeline():
    """the founder's camera (founder.py), the hall, him breathing, and the brands appearing one by one in gold"""
    K = lambda p, v: [p, v, 0.5, 1, 0.5, 0, 0, 1]  # noqa: E731
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
        'effects': {'static': {'bloom': {'intensity': 2.0}}, 'tracks': {}},
    }
    for i in range(len(BRANDS)):
        p0 = 0.95 + i * 0.12
        objects[f'asset-{i + 3}'] = {'static': {}, 'tracks': {'visibility': [K(p0, 0), K(p0 + 0.3, 1)]}}
    ART.mkdir(parents=True, exist_ok=True)
    (ART / 'timeline.json').write_text(json.dumps({'length': 10, 'objects': objects}))
    print('  timeline written', flush=True)


if __name__ == '__main__':
    _, at, _ = backdrop()
    plaques(at)
    timeline()
    print('  (the founder: founder.py writes founder.glb; kept)', flush=True)
