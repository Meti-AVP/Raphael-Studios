"""The hero's scene from the chosen paintings (hero_v5.py makes the candidates): each figure picked out of its black
ground (BiRefNet), raised into a relief by its depth (Depth Anything V2) and placed in the frame; the backdrop, the
painted garden of old Cairo (v3's hero backdrop) and the pyramids under the stars, turned into holograms (layers of
light, drawn by the engine's hologram shader: stage/shaders.ts, hologramFrag); where the camera's flash and the
model's hand are (anchors.json, for hero_v5.mjs); the scene's timeline.

    py tools/scenes/remake/hero_v5_build.py            everything
    py tools/scenes/remake/hero_v5_build.py figures    only the figures and the anchors
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from founder import mesh_from
from paint import ROOT, feather, grow
from relief import NODE, depth, write_glb

OUT = Path('D:/RAhpel/.work-raphael/v5-art/hero')
ART = ROOT / 'art' / 'scenes' / 'hero-v5'
MODELS = Path('D:/RAhpel/.work-raphael/models')
FOV = 30.0
ASPECT = 1.6
TAN = np.tan(np.radians(FOV) / 2)

# the chosen paintings and where they stand: their figure's box on the screen at rest (x0, y0, x1, y1, fractions;
# the height decides the size), how far from the camera, how deep the relief, and the points the scene needs (px)
CHOICE = {
    'photographer': {
        'file': 'photographer-72.jpg',  # a bearded statue, his camera to his eye, in profile, facing right
        'box': (-0.08, 0.1, 0.38, 1.06),  # half length: he stands in the frame's lower left, cut by its edges
        'dist': 5.6,
        'thickness': 0.5,
        'cut': None,
        'flash': (805, 612),  # the front of his lens
        'phase': 0.0,
    },
    'model': {
        'file': 'model-clean.jpg',  # (model-74, widened, mirrored, her painted bag taken away: hero_v5.py)
        'box': (0.62, 0.05, 1.08, 1.06),  # (clear of the title frame in the middle)
        'dist': 6.2,
        'thickness': 0.5,
        'cut': None,
        'hand': (402, 522),  # her curled fingers: the handles go there
        # the widening's leftovers beside her hand (a patch of ground, the painted cord) go; the hand stays
        'drop': [(0, 0, 396, 1216), (380, 556, 528, 800), (380, 800, 430, 1216)],
        'keep': [(352, 360, 476, 556)],
        'phase': 2.4,
    },
}


def birefnet(rgb: np.ndarray) -> np.ndarray:
    """the subject's alpha (BiRefNet lite, ONNX through OpenCV: no extra libraries), at the picture's size"""
    net = cv2.dnn.readNetFromONNX(str(MODELS / 'birefnet-lite.onnx'))
    x = cv2.resize(rgb, (768, 768), interpolation=cv2.INTER_AREA).astype(np.float32)  # (1024 needs more memory than this machine spares)
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    net.setInput(x.transpose(2, 0, 1)[None].astype(np.float32))
    out = net.forward()
    m = 1 / (1 + np.exp(-out[0, 0]))
    return cv2.resize(m.astype(np.float32), (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC).clip(0, 1)


def matte(rgb: np.ndarray) -> np.ndarray:
    """the statue's alpha on its plain ground: what stands in front of the ground (the depth, against a smooth surface
    fitted to the picture's borders), refined on the colours by GrabCut, the largest piece, softened at its edge"""
    h, w = rgb.shape[:2]
    d = depth(rgb)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    border = np.zeros((h, w), bool)
    k = 12
    border[:k], border[:, :k], border[:, -k:] = True, True, True
    near_border = border & (d < np.percentile(d, 60))
    terms = lambda x, y: [np.ones_like(x), x, y, x * y, x * x, y * y]  # noqa: E731
    A = np.stack(terms(xx[near_border] / w, yy[near_border] / h), 1)
    coef = np.linalg.lstsq(A, d[near_border], rcond=None)[0]
    ground = sum(c * t for c, t in zip(coef, terms(xx / w, yy / h)))
    lift = d - ground
    gc = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    gc[lift > 0.06] = cv2.GC_PR_FGD
    gc[lift > 0.16] = cv2.GC_FGD
    gc[lift < 0.015] = cv2.GC_BGD
    gc[:4], gc[:, :4], gc[:, -4:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    img8 = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    cv2.grabCut(cv2.cvtColor(img8, cv2.COLOR_RGB2BGR), gc, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    m = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lbl, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        m = (lbl == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    # small holes filled (a speck the colours missed); a large one is the ground seen between an arm and the body
    holes = (1 - m).astype(np.uint8)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(holes)
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if area < 1500 and x > 0 and y > 0 and x + bw < w and y + bh < h:
            m[lbl == i] = 1
    return feather(m.astype(np.float32), 1.2)


def place(name: str, rgb: np.ndarray, alpha: np.ndarray, c: dict):
    """the figure as a relief in the frame; returns the function that takes a picture point to the scene"""
    h, w = alpha.shape
    ys, xs = np.nonzero(alpha > 0.5)
    fx0, fy0, fx1, fy1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    sx0, sy0, sx1, sy1 = c['box']
    scale = (sy1 - sy0) / (fy1 - fy0)  # screen heights per picture pixel
    # centred in its box across
    fw = (fx1 - fx0) * scale / ASPECT
    ox = sx0 + ((sx1 - sx0) - fw) / 2
    d = depth(rgb * alpha[..., None] + (1 - alpha[..., None]) * 0.0)
    dd = cv2.GaussianBlur(d, (0, 0), 4)
    centre = float(np.median(dd[alpha > 0.5]))

    def to_scene(px, py, toward=0.0):
        u = ox + (px - fx0) * scale / ASPECT
        v = sy0 + (py - fy0) * scale
        z = c['dist'] + (centre - float(dd[int(np.clip(py, 0, h - 1)), int(np.clip(px, 0, w - 1))])) * c['thickness'] - toward
        return [float((u * 2 - 1) * z * TAN * ASPECT), float((1 - v * 2) * z * TAN), float(-z)]

    stride = 4
    gy, gx = np.mgrid[fy0 - 8:fy1 + 8:stride, fx0 - 8:fx1 + 8:stride].astype(np.float32)
    gx = np.clip(gx, 0, w - 1)
    gy = np.clip(gy, 0, h - 1)
    u = ox + (gx - fx0) * scale / ASPECT
    v = sy0 + (gy - fy0) * scale
    inside = cv2.dilate((alpha > 0.5).astype(np.uint8), np.ones((9, 9), np.uint8))[gy.astype(int), gx.astype(int)] > 0
    dist = c['dist'] + (centre - dd[gy.astype(int), gx.astype(int)]) * c['thickness']
    pts = np.stack([(u * 2 - 1) * dist * TAN * ASPECT, (1 - v * 2) * dist * TAN, -dist], -1)
    cx0, cy0, cx1, cy1 = max(0, fx0 - 8), max(0, fy0 - 8), min(w, fx1 + 8), min(h, fy1 + 8)
    crop = np.dstack([np.clip(rgb, 0, 1), feather(alpha, 1.0)])[cy0:cy1, cx0:cx1]
    uvs = np.stack([(gx - cx0) / crop.shape[1], (gy - cy0) / crop.shape[0]], -1)
    m = mesh_from(pts, inside, uvs, jump=0.3, dist=dist)
    folder = OUT / name
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'mesh.json').write_text(json.dumps(m))
    Image.fromarray((crop * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
    print(f'  {name}: {len(m["positions"])} vertices', flush=True)
    write_glb(folder, ART / f'{name}.glb', f'paint-{name}', 'float', 'amp=0.07', f'phase={c["phase"]}')
    return to_scene


def figure(name: str) -> tuple[np.ndarray, np.ndarray]:
    c = CHOICE[name]
    rgb = np.asarray(Image.open(OUT / 'cands' / c['file']).convert('RGB')).astype(np.float32) / 255
    a = matte(rgb)
    if c['cut']:
        a[c['cut']:] = 0
    # (inside a keep box only the stone stays: marble is nearly grey, the painted ground beside it is not)
    sat = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2HSV)[..., 1].astype(np.float32) / 255
    keep = np.zeros_like(a)
    for (kx0, ky0, kx1, ky1) in c.get('keep', []):
        stone = feather((sat[ky0:ky1, kx0:kx1] < 0.15).astype(np.float32), 1.0)
        keep[ky0:ky1, kx0:kx1] = a[ky0:ky1, kx0:kx1] * stone
    for (x0, y0, x1, y1) in c.get('drop', []):
        a[y0:y1, x0:x1] = 0
    a = np.maximum(a, keep)
    # the largest piece only (stray specks of the ground go)
    n, lbl, st, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8))
    if n > 1:
        keep = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        a *= cv2.dilate((lbl == keep).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
    Image.fromarray((a * 255).astype(np.uint8)).save(OUT / f'{name}-alpha.png')
    return rgb, a


def figures():
    ART.mkdir(parents=True, exist_ok=True)
    rgb, a = figure('photographer')
    ph = place('photographer', rgb, a, CHOICE['photographer'])
    rgb, a = figure('model')
    mo = place('model', rgb, a, CHOICE['model'])
    F = ph(*CHOICE['photographer']['flash'], toward=0.25)
    Hd = mo(*CHOICE['model']['hand'], toward=0.35)
    S = 1.55  # the statues are larger than life: real things beside them, scaled alike
    # the panorama: out of the bag's doors, up behind the model's head, then across the sky above both statues, far
    # behind them (it passes behind the photographer's head), over the title frame
    arc = [None, [Hd[0] + 0.35, Hd[1] + 1.45, Hd[2] - 0.6], [0.9, 2.15, -8.6], [-3.4, 1.8, -8.8]]
    anchors = {
        'scale': S,
        'bagScale': 2.1,
        'flash': F,
        'hand': Hd,
        'bagYaw': -0.42,
        'arc': arc,
        'panel': 0.78,  # a picture's width in the sky (m)
        # the shirt and the box land in the foreground, low in the middle, under the title frame
        'tee': [-0.2, -0.76, -4.4],
        'teeScale': 0.72,
        'box': [0.24, -0.82, -4.0],
        'boxScale': 1.3,
    }
    (OUT / 'anchors.json').write_text(json.dumps(anchors, indent=1))
    print('  anchors', json.dumps(anchors), flush=True)
    subprocess.run([NODE, str(ROOT / 'tools' / 'scenes' / 'remake' / 'hero_v5.mjs')], check=True)


# ------------------------------------------------------------------------------------------------- the backdrop
def holo_source(rgb: np.ndarray, d: np.ndarray, sky_below: float) -> np.ndarray:
    """what the hologram shader lights: the picture's lines and its lit shapes, contrast pushed so the forms read as
    light; the sky (smooth, high in the picture, far) taken away; far things (the domes, the minarets) kept, dimmer"""
    h, w = d.shape
    g = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    g = clahe.apply((g * 255).astype(np.uint8)).astype(np.float32) / 255
    e = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3))
    e = np.clip(e / np.percentile(e, 99), 0, 1)
    mu = cv2.GaussianBlur(g, (0, 0), 7)
    sd = np.sqrt(np.clip(cv2.GaussianBlur(g * g, (0, 0), 7) - mu * mu, 0, 1))
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32) / h
    sky = ((sd < 0.03) & (d < sky_below + 0.08) & (yy < 0.62)).astype(np.float32)
    sky = cv2.morphologyEx(sky, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    sky = cv2.GaussianBlur(sky, (0, 0), 5)
    near = np.clip((d - sky_below) / 0.12, 0, 1)
    # the skyline (the upper part: domes, minarets, palms) carries the picture; the dense garden below stays faint
    upper = np.clip(1.25 - yy * 1.25, 0.35, 1.0)
    v = np.clip((g ** 1.25 * 0.8 * (0.45 + 0.55 * near) + e * 1.0) * (1 - 0.95 * sky) * upper, 0, 1)
    return np.dstack([v, v, v])


def backdrop():
    """two hologram layers: old Cairo's garden and domes (mid), the pyramids under the stars (far)"""
    layers = [
        ('holo-cairo', ROOT / 'art/scenes/hero/Hero-bg-hires-optimized.ktx2.png', 11.0, 1.8, 0.30, (0, 0, 1, 1)),
        ('holo-giza', ROOT / 'art/scenes/communication/EW26_Sidekick_bg_stars-optimized_89d84022-03c9-4267-bb0f-71a26f688511.ktx2.png', 17.0, 0.8, 0.22, (0, 0.38, 1, 1)),
    ]
    for name, src, dist0, thick, sky, crop in layers:
        im = Image.open(src).convert('RGB')
        W0, H0 = im.size
        x0, y0, x1, y1 = int(crop[0] * W0), int(crop[1] * H0), int(crop[2] * W0), int(crop[3] * H0)
        im = im.crop((x0, y0, x1, y1))
        w = 2048
        h = int(round(im.height * w / im.width / 4)) * 4
        rgb = np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
        d = depth(rgb)
        src_img = holo_source(rgb, d, sky)
        folder = OUT / name
        folder.mkdir(parents=True, exist_ok=True)
        Image.fromarray((src_img * 255).astype(np.uint8)).save(folder / 'preview.jpg', quality=85)
        # a relief across the whole view (and more: the camera moves), each pixel pushed back by its depth
        stride = 12
        gy, gx = np.mgrid[0:h + 1:stride, 0:w + 1:stride].astype(np.float32)
        gx = np.minimum(gx, w - 1)
        gy = np.minimum(gy, h - 1)
        dd = cv2.GaussianBlur(d, (0, 0), 6)[gy.astype(int), gx.astype(int)]
        dist = dist0 + (1 - dd) * thick * 3
        cover = 1.5  # the picture spans 1.5 x the view at rest (room for the camera's moves)
        half_h = dist0 * TAN * cover
        half_w = half_h * w / h
        u = gx / (w - 1)
        v = gy / (h - 1)
        lift = {'holo-giza': 4.2, 'holo-cairo': -0.9}[name]  # the pyramids up to the horizon, the domes down into view
        pts = np.stack([(u * 2 - 1) * half_w * dist / dist0, (1 - v * 2) * half_h * dist / dist0 + lift, -dist], -1)
        uvs = np.stack([u, v], -1)
        m = mesh_from(pts, np.ones(dd.shape, bool), uvs)
        (folder / 'mesh.json').write_text(json.dumps(m))
        Image.fromarray((np.dstack([src_img, np.ones(src_img.shape[:2])]) * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
        write_glb(folder, ART / f'{name}.glb', name)


def ground():
    """the dark behind everything: a deep teal night, darker at its edges, with a faint haze low down"""
    w, h = 1024, 512
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    v = 1 - yy / h
    r = np.hypot((xx - w * 0.5) / (w * 0.6), (yy - h * 0.62) / (h * 0.7))
    base = np.array([0.008, 0.03, 0.035], np.float32)
    glow = np.array([0.02, 0.09, 0.095], np.float32)
    img = base + glow * np.clip(1 - r, 0, 1)[..., None] ** 1.5 + np.array([0.0, 0.02, 0.02]) * np.clip(1 - v * 2.2, 0, 1)[..., None]
    folder = OUT / 'night'
    folder.mkdir(parents=True, exist_ok=True)
    dist = 24.0
    half_h = dist * TAN * 1.6
    half_w = half_h * w / h
    gy, gx = np.mgrid[0:9, 0:9].astype(np.float32) / 8
    pts = np.stack([(gx * 2 - 1) * half_w, (1 - gy * 2) * half_h, np.full_like(gx, -dist)], -1)
    m = mesh_from(pts, np.ones(gx.shape, bool), np.stack([gx, gy], -1))
    (folder / 'mesh.json').write_text(json.dumps(m))
    Image.fromarray((np.dstack([np.clip(img, 0, 1), np.ones((h, w))]) * 255).astype(np.uint8), 'RGBA').save(folder / 'texture.png')
    write_glb(folder, ART / 'night.glb', 'paint-night')


def timeline():
    """the intro (positions 0..1, played over five seconds as the page opens; the hero rests at 1): the camera comes in from further back;
    the flash goes off; the bag's doors fly open and the work spills out. Then the scroll: the camera drifts towards the
    bag and the panorama; the pointer turns it a little"""
    K = lambda p, v: [p, v, 0.5, 1, 0.5, 0, 0, 1]  # noqa: E731
    L = lambda p, v: [p, v, 1, 1, 0, 0, 0, 1]  # noqa: E731  (linear: the next segment's handles on the diagonal)
    cam = {
        'static': {'gaze': 0.35, 'fov': FOV, 'rotation': {'x': 0, 'y': 0, 'z': 0}},
        'tracks': {
            'position.x': [K(0, -0.2), K(1, 0.0), K(2.2, 0.45), K(3.4, 0.85)],
            'position.y': [K(0, 0.45), K(1, 0.0), K(2.2, -0.1), K(3.4, -0.25)],
            'position.z': [K(0, 2.6), K(1, 0.0), K(2.2, -0.8), K(3.4, -1.5)],
            'target.x': [K(0, 0.0), K(1, 0.0), K(2.2, 0.55), K(3.4, 0.9)],
            'target.y': [K(0, 0.25), K(1, 0.08), K(2.2, 0.2), K(3.4, 0.25)],
            'target.z': [K(0, -7.0), K(1, -7.0), K(3.4, -7.0)],
        },
    }
    objects = {
        'camera': cam,
        'asset-1': {'static': {}, 'tracks': {}},  # the night
        'asset-2': {'static': {}, 'tracks': {}},  # the pyramids (hologram)
        'asset-3': {'static': {}, 'tracks': {}},  # old Cairo (hologram)
        'asset-4': {'static': {'animations': {'float': {'loop': True}}}, 'tracks': {}},  # the photographer
        'asset-5': {'static': {'animations': {'float': {'loop': True}}}, 'tracks': {}},  # the model
        'asset-6': {'static': {'animations': {'float': {'loop': True}}}, 'tracks': {'animations.spill.progress': [L(0.74, 0), K(0.98, 1)]}},
        'asset-7': {'static': {}, 'tracks': {'animations.flash.progress': [L(0.69, 0), L(0.85, 1)]}},
        'effects': {'static': {'bloom': {'intensity': 2.4}}, 'tracks': {'flash.intensity': [L(0.69, 0), L(0.715, 1), K(0.83, 0)]}},
    }
    ART.mkdir(parents=True, exist_ok=True)
    (ART / 'timeline.json').write_text(json.dumps({'length': 10, 'objects': objects}))
    print('  timeline written', flush=True)


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('all', 'figures'):
        figures()
    if what in ('all', 'backdrop'):
        ground()
        backdrop()
    if what in ('all', 'timeline', 'figures'):
        timeline()
