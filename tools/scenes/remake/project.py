"""Editing a chart-packed painting the way the camera sees it.

Some of the reference's paintings were baked onto their meshes in many small charts (the visualization's drawing is
cut in a hundred pieces across its texture); a change that crosses them (a pair of headphones over the hair) cannot be
painted in the texture itself. Here the frame is painted instead, and the new colours are carried back to the texels
they came from:
  * tools/scenes/remake/uvpass.mjs renders, for one timeline position, which texel every pixel of the frame shows;
  * view() rebuilds the frame from the texture (only the chosen meshes, unlit, exactly as the texture has it);
  * the frame is painted (SDXL, paint.py) where a screen mask says;
  * back() splats each painted pixel onto its texel (the frame is drawn at about twice the texture's density there, so
    nearly every texel gets several), fills the few texels between, and refills the charts' padding (bleed).
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from paint import SRC, Tex, bleed, feather


class Pass:
    def __init__(self, scene: str, pos: str):
        self.dir = SRC / scene / f'uvpass-{pos}'
        self.camera = json.loads((self.dir / 'camera.json').read_text())
        uv = np.asarray(Image.open(self.dir / 'uv.png').convert('RGBA')).astype(np.int32)
        self.on = uv[..., 3] > 127
        self.u = (uv[..., 0] * 16 + (uv[..., 2] >> 4) + 0.5) / 4096.0
        self.v = (uv[..., 1] * 16 + (uv[..., 2] & 15) + 0.5) / 4096.0
        self.frame = np.asarray(Image.open(self.dir / 'frame.png').convert('RGB')).astype(np.float32) / 255
        self.h, self.w = self.on.shape

    def view(self, t: Tex) -> np.ndarray:
        """the frame rebuilt from the texture (bilinear), the page's frame where the meshes are not"""
        mx = (self.u * t.w - 0.5).astype(np.float32)
        my = (self.v * t.h - 0.5).astype(np.float32)
        img = cv2.remap(t.rgb.astype(np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        return np.where(self.on[..., None], img, self.frame)

    def back(self, t: Tex, painted: np.ndarray, mask: np.ndarray, charts: np.ndarray | None = None) -> np.ndarray:
        """carries the painted frame back into t where mask (screen space, 0..1) says; returns the texels changed (0..1)"""
        sel = self.on & (mask > 0.002)
        ys, xs = np.nonzero(sel)
        tx = np.clip((self.u[ys, xs] * t.w).astype(np.int32), 0, t.w - 1)
        ty = np.clip((self.v[ys, xs] * t.h).astype(np.int32), 0, t.h - 1)
        acc = np.zeros((t.h, t.w, 3), np.float64)
        wsum = np.zeros((t.h, t.w), np.float64)
        msum = np.zeros((t.h, t.w), np.float64)
        np.add.at(acc, (ty, tx), painted[ys, xs].astype(np.float64))
        np.add.at(wsum, (ty, tx), 1.0)
        np.add.at(msum, (ty, tx), mask[ys, xs].astype(np.float64))
        hit = wsum > 0
        col = np.zeros_like(t.rgb)
        col[hit] = (acc[hit] / wsum[hit][:, None]).astype(np.float32)
        amt = np.zeros((t.h, t.w), np.float32)
        amt[hit] = (msum[hit] / wsum[hit]).astype(np.float32)
        # the texels between hits (where the frame was coarser than the texture): from their neighbours
        holes = (~hit) & (cv2.dilate(hit.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
        if charts is not None:
            holes &= charts > 0.5
        c, w = col * hit[..., None], hit.astype(np.float32)
        a = amt * hit
        for _ in range(3):
            cs = cv2.boxFilter(c, -1, (3, 3), normalize=False)
            ws = cv2.boxFilter(w, -1, (3, 3), normalize=False)
            as_ = cv2.boxFilter(a, -1, (3, 3), normalize=False)
            new = holes & (w == 0) & (ws > 0)
            c[new] = cs[new] / ws[new][:, None]
            a[new] = as_[new] / ws[new]
            w[new] = 1
        a = np.clip(a, 0, 1)
        t.rgb = t.rgb * (1 - a[..., None]) + c * a[..., None]
        if charts is not None:
            bleed(t, charts)
        return a

    def save(self, name: str, img: np.ndarray):
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(self.dir / name, quality=90)
