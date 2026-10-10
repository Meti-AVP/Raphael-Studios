"""Painted reliefs (v4): something new painted into a scene's frame, then raised into 3D the way the reference built its
figures: a painting projected from the camera onto a relief that has the depth of what it shows.

    1. capture.mjs  the scene's frame at a timeline position, the camera's matrices, where its objects are on screen;
    2. paint()      SDXL paints the new figure into a mask of that frame (the existing objects stay as they are);
    3. cutout()     the figure's outline: what is nearer than the backdrop (Depth Anything V2, Apache-2.0) in the mask;
    4. raise_()     every pixel of the figure goes back into the scene along its camera ray, to a depth taken from the
                    depth map (scaled to a sculpture's thickness, centred on an anchor such as the box it holds);
                    the mesh, its UVs and its RGBA texture go to relief.mjs, which writes the GLB.

From the capture's camera the relief shows the painting exactly; as the camera moves (the timeline) it turns with
the depth it has, like the reference's own figures.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from paint import ROOT, SRC, Painter, Tex, feather, grow

NODE = os.environ.get('NODE', 'node')


def load_capture(scene: str):
    d = SRC / scene / 'capture'
    cam = json.loads((d / 'camera.json').read_text())
    img = np.asarray(Image.open(d / 'frame.png').convert('RGB')).astype(np.float32) / 255
    return cam, img


def screen_box(cam: dict, name: str, w: int, h: int):
    """the projected bounding box of a named object: (x0, y0, x1, y1) in pixels, and its mean camera distance"""
    pts = cam['boxes'][name]
    xs = [p['screen'][0] * w for p in pts]
    ys = [p['screen'][1] * h for p in pts]
    zs = [p['screen'][2] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys)), float(np.mean(zs))


def frame_tex(scene: str, img: np.ndarray) -> Tex:
    t = Tex.__new__(Tex)
    t.scene, t.name = scene, 'capture'
    t.rgb = img.copy()
    t.alpha = np.ones(img.shape[:2], np.float32)
    t.h, t.w = img.shape[:2]
    return t


def paint(p: Painter, t: Tex, mask: np.ndarray, prompt: str, *, seed: int, negative: str, style: str, tag: str, area=1024 * 1024):
    """the figure painted into the frame (full strength inside the mask; no edge guidance: it is new)"""
    p.paint(t, mask, prompt, strength=1.0, control=0.0, steps=34, guidance=7.5, seed=seed, area=area, feather_px=3,
            style=style, negative=negative, tag=tag)
    return t


_depth = None


def depth(img: np.ndarray) -> np.ndarray:
    """relative depth (Depth Anything V2 Small: larger = nearer), at the image's size, 0..1"""
    global _depth
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    if _depth is None:
        name = 'depth-anything/Depth-Anything-V2-Small-hf'
        _depth = (AutoImageProcessor.from_pretrained(name), AutoModelForDepthEstimation.from_pretrained(name).eval())
    proc, model = _depth
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    with torch.no_grad():
        out = model(**proc(images=im, return_tensors='pt')).predicted_depth[0].numpy()
    out = cv2.resize(out, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
    lo, hi = np.percentile(out, [1, 99.5])
    return np.clip((out - lo) / max(hi - lo, 1e-6), 0, 1).astype(np.float32)


def cutout(d: np.ndarray, region: np.ndarray, keep_out: np.ndarray, seed_pt=None) -> np.ndarray:
    """the figure: the nearer part of the region (Otsu on the depth inside it), cleaned, minus keep_out (e.g. the 3D
    box, which stays the real one); the largest piece, or the one holding seed_pt"""
    sel = region > 0.5
    v = (d[sel] * 255).astype(np.uint8)
    thr, _ = cv2.threshold(v, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = ((d * 255 > thr) & sel).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(m)
    if n <= 1:
        return m.astype(np.float32)
    if seed_pt is not None and lbl[int(seed_pt[1]), int(seed_pt[0])] > 0:
        keep = lbl[int(seed_pt[1]), int(seed_pt[0])]
    else:
        keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    m = (lbl == keep).astype(np.float32) * (1 - (keep_out > 0.5))
    return m


def raise_(cam: dict, img: np.ndarray, alpha: np.ndarray, d: np.ndarray, anchor_dist: float, thickness: float, out: Path,
           stride: int = 3, pad: int = 6, jump: float = 0.25):
    """the relief: a grid over the figure (every `stride` px), each vertex pushed out along its camera ray to
    anchor_dist + (centre - depth) * thickness; cells across a depth jump (an arm in front of the body) are left
    open. Writes mesh.json (world positions, uvs, triangles) and texture.png (RGBA) for relief.mjs."""
    h, w = alpha.shape
    ys, xs = np.nonzero(alpha > 0.5)
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(w, xs.max() + 1 + pad), min(h, ys.max() + 1 + pad)
    a = feather(alpha, 1.2)
    rgba = np.dstack([img, a])[y0:y1, x0:x1]
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA').save(out / 'texture.png')
    # depth inside the figure, smoothed (no stepping), centred
    inside = (alpha > 0.5).astype(np.float32)
    dd = cv2.GaussianBlur(d * inside, (0, 0), 3) / np.maximum(cv2.GaussianBlur(inside, (0, 0), 3), 1e-4)
    centre = float(np.median(dd[alpha > 0.5]))
    dist = anchor_dist + (centre - dd) * thickness
    mw = np.array(cam['matrixWorld'], np.float64).reshape(4, 4).T
    tan = np.tan(np.radians(cam['fov']) / 2)
    asp = cam['aspect']
    gx = np.arange(x0, x1, stride)
    gy = np.arange(y0, y1, stride)
    grow_a = grow((alpha > 0.5).astype(np.float32), stride)  # vertices a little outside: the texture's alpha cuts the edge
    idx = -np.ones((len(gy), len(gx)), np.int64)
    pos, uv = [], []
    for j, py in enumerate(gy):
        for i, px in enumerate(gx):
            if grow_a[py, px] < 0.5:
                continue
            z = float(dist[py, px])
            nx = (px + 0.5) / w * 2 - 1
            ny = 1 - (py + 0.5) / h * 2
            pc = np.array([nx * z * tan * asp, ny * z * tan, -z, 1.0])
            pw = mw @ pc
            idx[j, i] = len(pos)
            pos.append(pw[:3].tolist())
            uv.append([(px - x0) / (x1 - x0), (py - y0) / (y1 - y0)])
    tris = []
    for j in range(len(gy) - 1):
        for i in range(len(gx) - 1):
            q = [idx[j, i], idx[j, i + 1], idx[j + 1, i], idx[j + 1, i + 1]]
            if min(q) < 0:
                continue
            zs = [dist[gy[j], gx[i]], dist[gy[j], gx[i + 1]], dist[gy[j + 1], gx[i]], dist[gy[j + 1], gx[i + 1]]]
            if max(zs) - min(zs) > jump * thickness:
                continue
            tris += [int(q[0]), int(q[2]), int(q[1]), int(q[1]), int(q[2]), int(q[3])]
    (out / 'mesh.json').write_text(json.dumps({'positions': pos, 'uvs': uv, 'indices': tris}))
    print(f'  relief: {len(pos)} vertices, {len(tris) // 3} triangles, texture {x1 - x0}x{y1 - y0}', flush=True)
    return out


def write_glb(folder: Path, dst: Path, name: str, *flags: str):
    subprocess.run([NODE, str(ROOT / 'tools' / 'scenes' / 'remake' / 'relief.mjs'), str(folder), str(dst), name, *flags], check=True)
