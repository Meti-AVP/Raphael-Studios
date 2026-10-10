"""v4: the people of the scenes become statues of white marble (Greek sculpture, Raphael's own world), standing in
Egypt (the backdrops) and holding the studio's products, which keep their colours. Nobody in the scenes is a painted
person any more: faces, hair, skin and clothes are carved stone; only the brand and its things are in colour.

Two ways, as for the rest of the remake (paint.py):
  * chart-packed atlases (robes cut into islands): turned to marble by colour (marble()): the painted light and folds
    are kept as the stone's modelling, the colours become a cool-to-warm marble ramp, faint veins run through it;
  * painted textures (heads, faces, whole figures): carved anew by SDXL (carve()), guided by their own edges, so the
    features stay where the relief expects them and the eyes become a statue's (no irises).

The starting point is v3's remake (new faces, colours, the studio's products): V3_ART, else the reference source.
"""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from paint import SRC, Clusters, Painter, Tex, feather, gradient_map, lab, rgb_of

V3_ART = SRC / 'base'  # v3's remade textures as v3 left them (a snapshot: v3 goes on separately)

# Pentelic marble: blue-grey in the deep shade, warm ivory in the light
MARBLE = [(0.0, '#5a5d66'), (0.2, '#8a8a8c'), (0.45, '#b9b3a8'), (0.68, '#dcd5c8'), (0.86, '#f1ebdf'), (1.0, '#fffcf5')]
CARVE_STYLE = ('classical white marble sculpture, Greek statue, carved stone, smooth polished marble, subtle grey veins, '
               'soft museum light, Renaissance oil painting of a statue')
CARVE_NEG = ('flesh, skin colour, tan skin, pink cheeks, red lips, coloured eyes, iris, pupils, painted eyes, makeup, hair colour, '
             'brown hair, blond hair, photo, 3d render, cgi, cartoon, text, letters, logo, watermark, blurry, lowres, deformed')


def base(scene: str, name: str) -> Tex:
    """the texture as v3 left it (or the source when v3 did not touch it)"""
    t = Tex(scene, name)
    v3 = V3_ART / scene / f'{name}.png'
    if v3.exists():
        a = np.asarray(Image.open(v3).convert('RGBA')).astype(np.float32) / 255
        t.rgb, t.alpha = a[..., :3].copy(), a[..., 3].copy()
    return t


def fbm(h: int, w: int, seed: int, octaves=5, base_cells=6) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = base_cells * 2 ** o
        n = rng.random((cells, max(2, int(cells * w / h)))).astype(np.float32)
        out += amp * cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
        total += amp
        amp *= 0.5
    return out / total


def veins(h: int, w: int, seed: int = 3, scale: float = 1.0) -> np.ndarray:
    """thin, wandering marble veins (0..1): a stretched sine through domain-warped noise"""
    warp = fbm(h, w, seed, 5, 3)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    phase = (xx * 0.55 + yy * 0.83) / (min(h, w) * 0.11 * scale) + warp * 9.0
    v = 1 - np.abs(np.sin(phase))
    v = np.clip((v - 0.9) / 0.1, 0, 1) ** 2  # only the crests: thin lines
    v *= np.clip((fbm(h, w, seed + 7, 4, 4) - 0.35) * 3, 0, 1)  # here and there, not everywhere
    return v.astype(np.float32)


def blur_in(x: np.ndarray, m: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur of x over the pixels where m is set only"""
    return cv2.GaussianBlur(x * m, (0, 0), sigma) / np.maximum(cv2.GaussianBlur(m, (0, 0), sigma), 1e-4)


def marble(t: Tex, mask: np.ndarray, *, keep_l=0.3, gamma=0.85, vein=0.1, seed=5, flatten=0.9, sigma=40.0, classes=6, lo=1,
           hi=99.5, drift=1.0):
    """The masked part turned to white marble. A statue is one stone: the garments' own colours (a dark tunic, light
    sleeves) are evened out (flatten: how much of the large-scale lightness goes), the folds and the modelling stay.
    On a chart-packed atlas (a figure cut in islands) neighbours in the texture are not neighbours on the figure: there
    flatten, vein and drift are 0 (anything spatial would differ island by island and show as patches)."""
    sel = mask > 0.02
    if not sel.any():
        return
    L = lab(t.rgb)
    l = L[..., 0]
    m = (mask > 0.5).astype(np.float32)
    if classes:
        # one stone for every material: each colour class (a navy tunic, saffron sleeves, skin) brought to the
        # same mean lightness, softly (pixels between two classes take both shifts in proportion)
        c = Clusters(t, mask, classes, seed=seed)
        w = c.weights(6.0)
        target = float(np.percentile(l[m > 0], 65)) if m.any() else 65.0
        means = np.array([(l * wk)[m > 0].sum() / max((wk[m > 0]).sum(), 1e-3) for wk in w], np.float32)
        shift = np.tensordot(target - means, w, axes=1)
        l = np.clip(l + shift, 0, 100)
    big = blur_in(l, m, sigma)
    mean = float(np.percentile(l[m > 0], 60)) if m.any() else 60.0
    flat = np.clip(l - flatten * (big - mean), 0, 100)
    L[..., 0] = np.where(mask > 0.02, flat, l)
    L[..., 1:] *= np.where(mask[..., None] > 0.02, 0.0, 1.0)
    t.rgb = np.where(mask[..., None] > 0.02, rgb_of(L), t.rgb)
    gradient_map(t, mask, MARBLE, keep=0.0, keep_l=keep_l, lo=lo, hi=hi, gamma=gamma)
    # a slow warm/cool drift through the stone, and its veins
    drift_n = (fbm(t.h, t.w, seed + 1, 3, 2) - 0.5)[..., None]
    tint = np.array([0.012, 0.004, -0.014], np.float32) * drift_n * 4 * drift
    v = veins(t.h, t.w, seed)[..., None] * vein
    col = np.array([0.5, 0.52, 0.56], np.float32)
    mm = mask[..., None]
    t.rgb = np.clip(t.rgb + tint * mm, 0, 1)
    t.rgb = t.rgb * (1 - v * mm) + (t.rgb * col) * (v * mm)


def carve(p: Painter, t: Tex, mask: np.ndarray, subject: str, *, strength=0.6, control=0.6, seed=11, rot=0, tag='carve',
          area=int(os.environ.get('RAPHAEL_CARVE_AREA', 896 * 896)), feather_px=4.0):
    """the masked part (a head, a face, a figure) carved anew in marble by SDXL, its outline kept"""
    p.paint(t, feather(mask, 2), f'{subject}, white marble statue, classical Greek sculpture, blank stone eyes',
            strength=strength, control=control, seed=seed, rot=rot, style=CARVE_STYLE, negative=CARVE_NEG,
            tag=tag, area=area, feather_px=feather_px)


def desaturate_check(t: Tex, mask: np.ndarray) -> float:
    """mean Lab chroma inside the mask (a statue should be near grey)"""
    L = lab(t.rgb)
    c = np.hypot(L[..., 1], L[..., 2])
    return float(c[mask > 0.5].mean()) if (mask > 0.5).any() else 0.0


def match_light(t: Tex, mask: np.ndarray, target_l: float, amount: float = 1.0):
    """brings the masked stone's mean lightness (Lab L) to target_l, keeping its modelling"""
    L = lab(t.rgb)
    sel = mask > 0.5
    if not sel.any():
        return
    shift = (target_l - float(L[..., 0][sel].mean())) * amount
    L[..., 0] = np.clip(L[..., 0] + shift * mask, 0, 100)
    t.rgb = rgb_of(L)


def mean_light(t: Tex, mask: np.ndarray) -> float:
    L = lab(t.rgb)
    return float(L[..., 0][mask > 0.5].mean())
