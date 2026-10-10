"""The v3 remake of the painted scenes: the tools every scene's script (tools/scenes/remake/<scene>.py) works with.

A scene texture is either one painting projected on its relief (a figure, a room: it can be repainted in place)
or a chart-packed atlas (robes and fur cut into hundreds of islands: they are recoloured, never repainted, since a
painting across the islands would break at every seam). So there are two kinds of edit:

  * colour: a gradient map or a hue move inside a mask, which keeps every painted fold, highlight and shadow;
  * paint:  SDXL inpainting guided by the texture's own edges (a canny ControlNet), so the new clothes, faces and
            objects keep the outline and the folds of the relief they are projected on.

Outside its mask a texture stays exactly as it was (the alpha channel too), so the islands, the seams and every
part nobody asked to change survive the remake. Results are written to art/scenes/<scene>/<texture>.png, where
tools/scenes/build.mjs takes them in place of the texture; tools/scenes/art.mjs exports the sources.

The models (in the Hugging Face cache, RAPHAEL_HF):
  diffusers/stable-diffusion-xl-1.0-inpainting-0.1   CreativeML Open RAIL++-M
  diffusers/controlnet-canny-sdxl-1.0-small          CreativeML Open RAIL++-M
  madebyollin/sdxl-vae-fp16-fix                       MIT
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(os.environ.get('RAPHAEL_V4_ART', 'D:/RAhpel/.work-raphael/v4-art'))  # v4's own work folder (v3 keeps its own)
ART = ROOT / 'art' / 'scenes'
os.environ.setdefault('HF_HOME', os.environ.get('RAPHAEL_HF', 'D:/RAhpel/.work-raphael/ai/hf'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')

TURQ = '#19b5a8'
TURQ_DEEP = '#0c6e66'

# what every painted figure should keep being: a Renaissance oil painting, not a photo or an illustration
STYLE = 'Italian Renaissance oil painting, old master, fine glazes, soft chiaroscuro, museum quality, detailed brushwork'
NEGATIVE = ('photo, photograph, 3d render, cgi, anime, cartoon, illustration, drawing, sketch, text, letters, logo, watermark, '
            'signature, frame, border, blurry, lowres, jpeg artifacts, deformed, extra fingers, bad anatomy, modern clothes')


# ------------------------------------------------------------------------------------------------- textures

class Tex:
    """One scene texture: float RGB (0..1) and its alpha, as exported by tools/scenes/art.mjs."""

    def __init__(self, scene: str, name: str):
        self.scene, self.name = scene, name
        src = SRC / scene / 'src' / f'{name}.png'
        a = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32) / 255.0
        self.rgb = a[..., :3].copy()
        self.alpha = a[..., 3].copy()
        self.h, self.w = self.rgb.shape[:2]

    @property
    def out(self) -> Path:
        return ART / self.scene / f'{self.name}.png'

    def save(self, preview: int = 1024) -> Path:
        self.out.parent.mkdir(parents=True, exist_ok=True)
        a = np.dstack([np.clip(self.rgb, 0, 1), self.alpha])
        Image.fromarray((a * 255 + 0.5).astype(np.uint8), 'RGBA').save(self.out, optimize=False, compress_level=6)
        work = SRC / self.scene / 'out'
        work.mkdir(parents=True, exist_ok=True)
        im = Image.fromarray((np.clip(self.rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
        im.thumbnail((preview, preview), Image.LANCZOS)
        im.save(work / f'{self.name}.jpg', quality=88)
        print(f'  saved {self.out.relative_to(ROOT)}', flush=True)
        return self.out

    def crop(self, box) -> np.ndarray:
        x0, y0, x1, y1 = box
        return self.rgb[y0:y1, x0:x1]


# ---------------------------------------------------------------------------------------------------- masks
# a mask is a float array (h, w) in 0..1

def rect(t: Tex, box) -> np.ndarray:
    m = np.zeros((t.h, t.w), np.float32)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = 1
    return m


def poly(t: Tex, *polys) -> np.ndarray:
    m = np.zeros((t.h, t.w), np.uint8)
    cv2.fillPoly(m, [np.asarray(p, np.int32).reshape(-1, 2) for p in polys], 255)
    return m.astype(np.float32) / 255


def ellipse_mask(t: Tex, centre, axes, angle: float = 0) -> np.ndarray:
    m = np.zeros((t.h, t.w), np.uint8)
    cv2.ellipse(m, tuple(int(v) for v in centre), tuple(int(v) for v in axes), angle, 0, 360, 255, -1)
    return m.astype(np.float32) / 255


def hsv(rgb: np.ndarray) -> np.ndarray:
    """h in degrees (0..360), s and v in 0..1"""
    a = cv2.cvtColor(np.clip(rgb, 0, 1).astype(np.float32), cv2.COLOR_RGB2HSV)
    return a


def hue_window(t: Tex, lo: float, hi: float, smin=0.2, vmin=0.06, soft=12.0, ssoft=0.1, rgb=None) -> np.ndarray:
    """pixels whose hue (degrees, may wrap: lo > hi) is between lo and hi and that are coloured enough; soft edges"""
    a = hsv(t.rgb if rgb is None else rgb)
    h, s, v = a[..., 0], a[..., 1], a[..., 2]
    half = ((hi - lo) % 360) / 2
    d = np.abs((h - (lo + half) + 180) % 360 - 180) - half  # degrees outside the window, around the circle
    mh = np.clip(1 - d / soft, 0, 1)
    ms = np.clip((s - smin) / ssoft + 0.5, 0, 1)
    mv = np.clip((v - vmin) / 0.04 + 0.5, 0, 1)
    return (mh * ms * mv).astype(np.float32)


def near(t: Tex, colours, radius=18.0, soft=10.0, rgb=None) -> np.ndarray:
    """pixels near any of the colours (hex), measured in Lab (radius ~ just noticeable x 8)"""
    lab = cv2.cvtColor(np.clip(t.rgb if rgb is None else rgb, 0, 1).astype(np.float32), cv2.COLOR_RGB2Lab)
    best = np.full(lab.shape[:2], 1e9, np.float32)
    for c in colours:
        c = np.asarray(hex_rgb(c), np.float32).reshape(1, 1, 3)
        cl = cv2.cvtColor(c, cv2.COLOR_RGB2Lab)[0, 0]
        best = np.minimum(best, np.linalg.norm(lab - cl, axis=-1))
    return np.clip(1 - (best - radius) / soft, 0, 1).astype(np.float32)


def greyish(t: Tex, cmax=20.0, soft=8.0, lmin=20.0, rgb=None) -> np.ndarray:
    """the nearly colourless pixels (whites, creams, greys: Lab chroma under cmax), lighter than lmin"""
    L = lab(t.rgb if rgb is None else rgb)
    c = np.hypot(L[..., 1], L[..., 2])
    return (np.clip((cmax - c) / soft + 0.5, 0, 1) * np.clip((L[..., 0] - lmin) / 6 + 0.5, 0, 1)).astype(np.float32)


def uvmask(t: Tex, *meshes: str) -> np.ndarray:
    """where the named meshes (all of the texture's meshes when none is named) paint in t (tools/scenes/remake/uvmasks.mjs)"""
    files = sorted((SRC / t.scene / 'uv').glob(f'{t.name}--*.png'))
    m = np.zeros((t.h, t.w), np.float32)
    for f in files:
        if not meshes or f.stem.split('--', 1)[1] in meshes:
            m = np.maximum(m, (np.asarray(Image.open(f)) > 0).astype(np.float32))
    return m


class Clusters:
    """The colours a garment texture is made of (k-means in Lab, lightness weighted down so a fold in shadow and the
    same cloth in light fall together), and soft masks of any of them."""

    LW = 0.3

    def __init__(self, t: Tex, mask: np.ndarray, k: int = 8, seed: int = 1):
        self.t = t
        L = lab(t.rgb)
        self.f = np.dstack([L[..., 0] * self.LW, L[..., 1], L[..., 2]]).astype(np.float32)
        sel = self.f[mask > 0.5]
        rng = np.random.default_rng(seed)
        sample = sel[rng.choice(len(sel), min(len(sel), 60000), replace=False)]
        cv2.setRNGSeed(seed)
        _, _, centers = cv2.kmeans(sample, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.2), 4,
                                   cv2.KMEANS_PP_CENTERS)
        order = np.argsort(centers[:, 0])
        self.centers = centers[order]
        self.mask = mask

    def describe(self):
        for i, c in enumerate(self.centers):
            l, a, b = c[0] / self.LW, c[1], c[2]
            print(f'  cluster {i}: L {l:5.1f}  chroma {np.hypot(a, b):5.1f}  hue {np.degrees(np.arctan2(b, a)):6.1f}  '
                  f'rgb {rgb_of(np.array([[[l, a, b]]], np.float32))[0, 0].round(2)}')

    def weights(self, sharp: float = 6.0) -> np.ndarray:
        """(k, h, w) soft membership of every pixel in every cluster"""
        d = np.stack([np.linalg.norm(self.f - c, axis=-1) for c in self.centers])
        e = np.exp(-(d - d.min(0)) / sharp)
        return e / e.sum(0)

    def soft(self, *ids: int, sharp: float = 6.0) -> np.ndarray:
        w = self.weights(sharp)
        return (w[list(ids)].sum(0) * self.mask).astype(np.float32)

    def islands(self, groups: dict, inside: np.ndarray, majority: float = 0.6, sharp: float = 5.0) -> dict:
        """Soft masks of groups of clusters ({'dress': [1, 2], ...}), decided island by island: an island where one
        group holds more than `majority` of the pixels is that group whole; in the others, pixel by pixel."""
        w = self.weights(sharp)
        n, lbl = cv2.connectedComponents((inside > 0.5).astype(np.uint8), connectivity=8)
        count = np.maximum(np.bincount(lbl.ravel(), minlength=n), 1)
        out = {}
        shares = {}
        for g, ids in groups.items():
            px = w[list(ids)].sum(0)
            shares[g] = (np.bincount(lbl.ravel(), weights=px.ravel(), minlength=n) / count, px)
        for g, (share, px) in shares.items():
            whole = (share > majority)[lbl]
            others = np.zeros(n, bool)
            for g2, (s2, _) in shares.items():
                if g2 != g:
                    others |= s2 > majority
            m = np.where(whole, 1.0, np.where(others[lbl], 0.0, px))
            m[lbl == 0] = 0
            out[g] = smooth(m.astype(np.float32), self.t.rgb, r=2) * (inside > 0.5)
            out[g + ':whole'] = whole.astype(np.float32) * (inside > 0.5)
        return out

    def pick(self, test) -> list[int]:
        """the clusters whose centre passes test(L, chroma, hue degrees)"""
        ids = []
        for i, c in enumerate(self.centers):
            l, a, b = c[0] / self.LW, c[1], c[2]
            if test(l, float(np.hypot(a, b)), float(np.degrees(np.arctan2(b, a)))):
                ids.append(i)
        return ids

    def preview(self, out: Path, size=900):
        pal = np.array([[230, 25, 75], [60, 180, 75], [255, 225, 25], [0, 130, 200], [245, 130, 48], [145, 30, 180],
                        [70, 240, 240], [240, 50, 230], [210, 245, 60], [250, 190, 212]], np.float32) / 255
        lbl = np.argmax(self.weights(), 0)
        vis = np.where(self.mask[..., None] > 0.5, pal[lbl % len(pal)] * 0.65 + self.t.rgb * 0.35, self.t.rgb * 0.25)
        s = np.concatenate([self.t.rgb, vis], 1)
        im = Image.fromarray((np.clip(s, 0, 1) * 255).astype(np.uint8))
        im.thumbnail((size * 2, size))
        im.save(out, quality=85)
        return out


def solid(t: Tex, threshold=0.5) -> np.ndarray:
    return (t.alpha > threshold).astype(np.float32)


def grow(m: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return m
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.dilate(m, k)


def shrink(m: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return m
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.erode(m, k)


def clean(m: np.ndarray, px: int = 2) -> np.ndarray:
    """removes specks and fills pinholes"""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)


def feather(m: np.ndarray, px: float) -> np.ndarray:
    if px <= 0:
        return m
    return cv2.GaussianBlur(m, (0, 0), px)


def smooth(m: np.ndarray, guide: np.ndarray, r: int = 8, eps: float = 1e-3) -> np.ndarray:
    """edge-aware smoothing of a soft mask along the picture's own edges (guided filter, He et al. 2010)"""
    g = cv2.cvtColor(np.clip(guide, 0, 1).astype(np.float32), cv2.COLOR_RGB2GRAY)
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mg, mm = box(g), box(m)
    a = (box(g * m) - mg * mm) / (box(g * g) - mg * mg + eps)
    b = mm - a * mg
    return np.clip(box(a) * g + box(b), 0, 1).astype(np.float32)


def bbox(m: np.ndarray, pad: int = 0):
    ys, xs = np.nonzero(m > 0.02)
    if len(xs) == 0:
        return None
    h, w = m.shape
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + 1 + pad), min(h, ys.max() + 1 + pad))


# --------------------------------------------------------------------------------------------------- colour

def hex_rgb(c) -> tuple[float, float, float]:
    if isinstance(c, str):
        c = c.lstrip('#')
        return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(float(x) for x in c)


def lab(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(np.clip(rgb, 0, 1).astype(np.float32), cv2.COLOR_RGB2Lab)


def rgb_of(lab_: np.ndarray) -> np.ndarray:
    return np.clip(cv2.cvtColor(lab_.astype(np.float32), cv2.COLOR_Lab2RGB), 0, 1)


def gradient_map(t: Tex, mask: np.ndarray, stops, keep: float = 0.15, keep_l: float = 0.35, lo=2, hi=98, gamma=1.0):
    """Paints the masked part with a new colour ramp: its lightness (stretched between its lo..hi percentiles) picks
    the colour from the stops [(0..1, '#hex'), ...]; keep_l of the original lightness and keep of its colour
    variations stay, so the brush strokes still read."""
    L = lab(t.rgb)
    sel = mask > 0.5
    if not sel.any():
        return
    l = L[..., 0]
    p0, p1 = np.percentile(l[sel], [lo, hi])
    x = np.clip((l - p0) / max(p1 - p0, 1e-3), 0, 1) ** gamma
    pos = np.array([s[0] for s in stops], np.float32)
    cols = lab(np.array([[hex_rgb(s[1]) for s in stops]], np.float32))[0]
    ramp = np.stack([np.interp(x, pos, cols[:, i]) for i in range(3)], -1)
    mean_ab = L[sel][:, 1:].mean(0)
    out = ramp.copy()
    out[..., 0] = ramp[..., 0] * (1 - keep_l) + l * keep_l
    out[..., 1:] = ramp[..., 1:] + keep * (L[..., 1:] - mean_ab)
    m = mask[..., None]
    t.rgb = t.rgb * (1 - m) + rgb_of(out) * m


def hue_move(t: Tex, mask: np.ndarray, to: str, sat: float = 1.0, light: float = 1.0, keep: float = 0.0):
    """Moves the masked colours' hue to the target's, scaling chroma (sat) and lightness (light); keeps the folds."""
    L = lab(t.rgb)
    tl = lab(np.array([[hex_rgb(to)]], np.float32))[0, 0]
    ang = np.arctan2(tl[2], tl[1])
    c = np.hypot(L[..., 1], L[..., 2]) * sat
    out = L.copy()
    out[..., 0] = np.clip(L[..., 0] * light, 0, 100)
    out[..., 1] = c * np.cos(ang) * (1 - keep) + L[..., 1] * keep
    out[..., 2] = c * np.sin(ang) * (1 - keep) + L[..., 2] * keep
    m = mask[..., None]
    t.rgb = t.rgb * (1 - m) + rgb_of(out) * m


def bleed(t: Tex, inside: np.ndarray, region: np.ndarray | None = None, reach: int = 24):
    """Refills a chart-packed texture's padding (everything outside the islands) from the islands' new colours, as
    the original bake did, so mipmaps blend an island with its own colours and not with the old ones: each island's
    edge colours pushed outward a pixel at a time (up to reach), then the rest from the average around (push-pull)."""
    own = (inside > 0.5).astype(np.float32)
    c, w = t.rgb * own[..., None], own.copy()
    for _ in range(reach):
        cs = cv2.boxFilter(c, -1, (3, 3), normalize=False)
        ws = cv2.boxFilter(w, -1, (3, 3), normalize=False)
        new = (w == 0) & (ws > 0)
        if not new.any():
            break
        c[new] = cs[new] / ws[new][:, None]
        w[new] = 1
    pyr = []
    pc, pw = c * w[..., None], w
    while min(pw.shape) > 8:
        pyr.append((pc, pw))
        h2, w2 = (pw.shape[0] + 1) // 2, (pw.shape[1] + 1) // 2
        pc = cv2.resize(pc, (w2, h2), interpolation=cv2.INTER_AREA)
        pw = cv2.resize(pw, (w2, h2), interpolation=cv2.INTER_AREA)
    fill = pc / np.maximum(pw, 1e-6)[..., None]
    for pc, pw in reversed(pyr):
        up = cv2.resize(fill, (pw.shape[1], pw.shape[0]), interpolation=cv2.INTER_LINEAR)
        k = np.clip(pw * 4, 0, 1)[..., None]  # trust a pixel's own average once it is mostly covered
        fill = pc / np.maximum(pw, 1e-6)[..., None] * k + up * (1 - k)
    out = np.where(w[..., None] > 0, c, fill)
    m = (1 - own) if region is None else (1 - own) * region
    t.rgb = t.rgb * (1 - m[..., None]) + out * m[..., None]


def levels(t: Tex, mask: np.ndarray, gain=1.0, lift=0.0, gamma=1.0, sat=1.0):
    x = np.clip(t.rgb, 0, 1) ** (1 / gamma) * gain + lift
    g = x.mean(-1, keepdims=True)
    x = g + (x - g) * sat
    m = mask[..., None]
    t.rgb = t.rgb * (1 - m) + np.clip(x, 0, 1) * m


# ----------------------------------------------------------------------------------------------------- paint

def _size_for(w: int, h: int, area: int) -> tuple[int, int]:
    s = (area / (w * h)) ** 0.5
    return max(512, int(round(w * s / 64)) * 64), max(512, int(round(h * s / 64)) * 64)


def edges(rgb: np.ndarray, lo: int | None = None, hi: int | None = None, blur: float = 1.2) -> np.ndarray:
    g = cv2.cvtColor((np.clip(rgb, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    if blur:
        g = cv2.GaussianBlur(g, (0, 0), blur)
    if lo is None:
        med = float(np.median(g))
        lo, hi = int(max(0, 0.66 * med) * 0.5), int(min(255, 1.33 * med) * 0.8)
    e = cv2.Canny(g, lo, hi)
    return np.repeat(e[..., None], 3, -1)


def read_safetensors(path: Path, device: str = 'cuda', dtype=None) -> dict:
    """A safetensors file read plainly, a tensor at a time straight to the device. (safetensors maps the whole file
    copy-on-write, and Windows reserves memory for all of it: a 5 GB UNet does not fit beside everything else.)"""
    import struct

    import torch
    dtypes = {'F16': torch.float16, 'BF16': torch.bfloat16, 'F32': torch.float32, 'I64': torch.int64}
    out = {}
    with open(path, 'rb') as fh:
        n = struct.unpack('<Q', fh.read(8))[0]
        header = json.loads(fh.read(n))
        for k, v in header.items():
            if k == '__metadata__':
                continue
            a, b = v['data_offsets']
            fh.seek(8 + n + a)
            buf = bytearray(fh.read(b - a))
            t = torch.frombuffer(buf, dtype=dtypes[v['dtype']]).reshape(v['shape'])
            out[k] = t.to(device=device, dtype=dtype or t.dtype)
    return out


def mapped_safetensors(path: Path) -> dict:
    """A safetensors file's tensors as read-only views of the file mapped in memory: they cost no memory commit
    (Windows counts the graphics card's memory in the commit too, and an 8 GB card plus SDXL do not fit in what
    is left). The weights are copied to the card a layer at a time while it computes (accelerate's cpu_offload)."""
    import struct
    import warnings

    import torch
    with open(path, 'rb') as fh:
        n = struct.unpack('<Q', fh.read(8))[0]
        header = json.loads(fh.read(n))
    mm = np.memmap(path, dtype=np.uint8, mode='r')
    kinds = {'F16': (np.float16, None), 'F32': (np.float32, None), 'BF16': (np.uint16, torch.bfloat16), 'I64': (np.int64, None)}
    out = {}
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')  # "the given NumPy array is not writable": it is meant not to be
        for k, v in header.items():
            if k == '__metadata__':
                continue
            a, b = v['data_offsets']
            npt, tt = kinds[v['dtype']]
            arr = mm[8 + n + a: 8 + n + b].view(npt).reshape(v['shape'])
            t = torch.from_numpy(arr)
            out[k] = t.view(tt) if tt is not None else t
    return out


def snapshot(repo: str, probe: str) -> Path:
    """the local copy of a model repository (the snapshot that holds probe)"""
    snaps = Path(os.environ['HF_HOME']) / 'hub' / f'models--{repo.replace("/", "--")}' / 'snapshots'
    return next(d for d in snaps.iterdir() if (d / probe).exists())


def build(cls, folder: Path, weights: str, device: str, dtype, mapped: bool = False):
    """a model built empty and given its weights: read plainly (read_safetensors) onto device in dtype, or, mapped,
    left in the file (mapped_safetensors) and moved to the card layer by layer as it computes"""
    from accelerate import init_empty_weights
    if hasattr(cls, 'load_config'):  # diffusers
        config = cls.load_config(folder)
        with init_empty_weights():
            model = cls.from_config(config)
    else:  # transformers
        config = cls.config_class.from_pretrained(folder)
        with init_empty_weights():
            model = cls(config)
    state = mapped_safetensors(folder / weights) if mapped else read_safetensors(folder / weights, device, dtype)
    # names may differ by a leading module (transformers 5 dropped CLIPTextModel's 'text_model.'): match them up
    own = set(model.state_dict().keys())
    state = {(k if k in own or k.split('.', 1)[-1] not in own else k.split('.', 1)[-1]): v for k, v in state.items()}
    missing, unexpected = model.load_state_dict(state, strict=False, assign=True)
    missing = [m for m in missing if not m.endswith('position_ids')]
    if missing:
        raise RuntimeError(f'{cls.__name__}: weights missing {missing[:3]} (unexpected {unexpected[:3]})')
    import torch
    for mod in model.modules():  # buffers made on the empty (meta) model and not in the file: made for real
        for name, buf in list(mod.named_buffers(recurse=False)):
            if buf.is_meta:
                if name == 'position_ids':
                    mod.register_buffer(name, torch.arange(buf.shape[-1], device=device).expand(buf.shape), persistent=False)
                else:
                    raise RuntimeError(f'{cls.__name__}: buffer {name} not loaded')
    if mapped:
        from accelerate import cpu_offload
        cpu_offload(model, execution_device=torch.device(device))
        return model.eval()
    return model.to(device=device, dtype=dtype).eval()


GPU_LOCK = Path(os.environ.get('RAPHAEL_GPU_LOCK', 'D:/RAhpel/.work-raphael/ai/gpu.lock'))


def _alive(pid: int) -> bool:
    import subprocess
    out = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV', '/NH'], capture_output=True, text=True).stdout
    return f'"{pid}"' in out


def gpu_lock(owner: str = 'v4'):
    """One SDXL process at a time on this machine (several sessions share one 8 GB card and the commit charge):
    a lock file made exclusively, holding '<owner> <pid>'; a lock left by a process that is gone is taken over."""
    import atexit
    import time
    GPU_LOCK.parent.mkdir(parents=True, exist_ok=True)
    waited = False
    while True:
        try:
            fd = os.open(GPU_LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f'{owner} {os.getpid()}'.encode())
            os.close(fd)
            break
        except FileExistsError:
            try:
                who, pid = GPU_LOCK.read_text().split()
                if not _alive(int(pid)):
                    GPU_LOCK.unlink(missing_ok=True)
                    continue
            except (ValueError, OSError):
                pass
            if not waited:
                print(f'   waiting for the graphics card ({GPU_LOCK.read_text(errors="ignore").strip()})', flush=True)
                waited = True
            time.sleep(5)
    me = f'{owner} {os.getpid()}'

    def release():
        try:
            if GPU_LOCK.read_text().strip() == me:
                GPU_LOCK.unlink()
        except OSError:
            pass
    atexit.register(release)


class Painter:
    """SDXL inpainting with a canny ControlNet; loaded once, kept for every job of a run. Results are cached by
    everything that makes them (the crop, the mask, the words, the settings), so a scene script can be rerun
    after changing one job and only that job is painted again."""

    pipe = None
    controlled = False
    encoders = None
    embeds: dict = {}

    def __init__(self, cache: Path | None = None):
        self.cache = cache or (SRC / '_cache')
        self.cache.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _cached(repo: str, pattern: str) -> bool:
        snap = Path(os.environ['HF_HOME']) / 'hub' / f'models--{repo.replace("/", "--")}' / 'snapshots'
        return any(snap.glob(f'*/{pattern}'))

    def mode(self) -> str:
        """'cn' when the edges guide the painting (the ControlNet is there and not switched off), 'plain' if not"""
        if Painter.pipe is not None:
            return 'cn' if Painter.controlled else 'plain'
        ok = self._cached('diffusers/controlnet-canny-sdxl-1.0-small', 'diffusion_pytorch_model*.safetensors')
        return 'cn' if ok and not os.environ.get('RAPHAEL_NO_CONTROL') else 'plain'

    def load(self):
        """The pipeline, sized for an 8 GB graphics card and a 16 GB computer: the UNet, the VAE and the ControlNet
        live on the card (each loaded and moved there before the next, so the computer never holds them all), the two
        text encoders stay on the CPU in bfloat16 and turn each prompt into embeddings once (encode())."""
        if Painter.pipe is not None:
            return Painter.pipe
        gpu_lock()
        import gc

        import torch
        from diffusers import (AutoencoderKL, ControlNetModel, EulerDiscreteScheduler,
                               StableDiffusionXLControlNetInpaintPipeline, StableDiffusionXLInpaintPipeline,
                               UNet2DConditionModel)
        from transformers import CLIPTextModel, CLIPTextModelWithProjection, CLIPTokenizer
        base = 'diffusers/stable-diffusion-xl-1.0-inpainting-0.1'
        f16, bf16 = torch.float16, torch.bfloat16
        root = snapshot(base, 'unet/diffusion_pytorch_model.fp16.safetensors')
        unet = build(UNet2DConditionModel, root / 'unet', 'diffusion_pytorch_model.fp16.safetensors', 'cuda', f16, mapped=True)
        gc.collect()
        if self._cached('madebyollin/sdxl-vae-fp16-fix', 'diffusion_pytorch_model.safetensors'):
            vae = build(AutoencoderKL, snapshot('madebyollin/sdxl-vae-fp16-fix', 'diffusion_pytorch_model.safetensors'),
                        'diffusion_pytorch_model.safetensors', 'cuda', f16)
        else:  # the model's own VAE: it overflows in half precision, so it decodes in float32 (tiled, to fit)
            vae = build(AutoencoderKL, root / 'vae', 'diffusion_pytorch_model.fp16.safetensors', 'cuda', torch.float32)
        cn = None
        if self.mode() == 'cn':
            cdir = snapshot('diffusers/controlnet-canny-sdxl-1.0-small', 'config.json')
            weights = 'diffusion_pytorch_model.fp16.safetensors' if (cdir / 'diffusion_pytorch_model.fp16.safetensors').exists() else 'diffusion_pytorch_model.safetensors'
            cn = build(ControlNetModel, cdir, weights, 'cuda', f16)
        gc.collect()
        Painter.encoders = (
            CLIPTokenizer.from_pretrained(root / 'tokenizer'),
            CLIPTokenizer.from_pretrained(root / 'tokenizer_2'),
            build(CLIPTextModel, root / 'text_encoder', 'model.fp16.safetensors', 'cuda', f16, mapped=True),
            build(CLIPTextModelWithProjection, root / 'text_encoder_2', 'model.fp16.safetensors', 'cuda', f16, mapped=True),
        )
        sched = EulerDiscreteScheduler.from_pretrained(root / 'scheduler')
        parts = dict(vae=vae, text_encoder=None, text_encoder_2=None, tokenizer=Painter.encoders[0],
                     tokenizer_2=Painter.encoders[1], unet=unet, scheduler=sched)
        if cn is not None:
            pipe = StableDiffusionXLControlNetInpaintPipeline(controlnet=cn, **parts)
        else:
            pipe = StableDiffusionXLInpaintPipeline(**parts)
        if vae.dtype == torch.float32:
            pipe.vae.enable_tiling()
        pipe.set_progress_bar_config(disable=True)
        pipe.enable_attention_slicing()  # smaller peaks on the card (its memory counts in Windows' commit too)
        pipe.vae.enable_tiling()
        Painter.pipe = pipe
        Painter.controlled = cn is not None
        print(f'   painter ready ({"with" if cn is not None else "without"} ControlNet, '
              f'{torch.cuda.memory_allocated() / 1e9:.1f} GB on the card)', flush=True)
        return pipe

    def encode(self, prompt: str, negative: str):
        """SDXL's two text encoders (the penultimate hidden states of both, concatenated, and the second's pooled
        projection), on the CPU; cached per prompt"""
        import torch
        key = (prompt, negative)
        if key in Painter.embeds:
            return Painter.embeds[key]
        tok1, tok2, te1, te2 = Painter.encoders
        out = []
        with torch.no_grad():
            for text in (prompt, negative):
                hidden = []
                pooled = None
                for tok, te in ((tok1, te1), (tok2, te2)):
                    ids = tok(text, padding='max_length', max_length=tok.model_max_length, truncation=True,
                              return_tensors='pt').input_ids.to('cuda')
                    o = te(ids, output_hidden_states=True)
                    hidden.append(o.hidden_states[-2])
                    pooled = o[0]
                out.append((torch.cat(hidden, -1).to('cuda', torch.float16), pooled.to('cuda', torch.float16)))
        (pe, pp), (ne, npool) = out
        Painter.embeds[key] = dict(prompt_embeds=pe, pooled_prompt_embeds=pp, negative_prompt_embeds=ne,
                                   negative_pooled_prompt_embeds=npool)
        return Painter.embeds[key]

    def paint(self, t: Tex, mask: np.ndarray, prompt: str, *, box=None, negative: str = NEGATIVE, strength=0.75,
              control=0.5, steps=30, guidance=6.5, seed=7, area=1024 * 1024, pad=48, feather_px=6.0,
              style: str | None = STYLE, control_end=0.8, rot: int = 0, tag='') -> np.ndarray:
        """Repaints the masked part of t (in place) and returns the painted crop. rot (quarter turns) turns the crop
        upright for the painting (a head packed upside down in its texture) and back."""
        if box is None:
            box = bbox(mask, pad)
        if box is None:
            return None
        x0, y0, x1, y1 = box
        crop = t.rgb[y0:y1, x0:x1]
        cm = mask[y0:y1, x0:x1]
        if rot % 2:  # a quarter turn: the painting's width is the crop's height
            W, H = _size_for(y1 - y0, x1 - x0, area)
        else:
            W, H = _size_for(x1 - x0, y1 - y0, area)
        words = f'{prompt}, {style}' if style else prompt
        key = hashlib.sha1(b''.join([
            (crop * 255).astype(np.uint8).tobytes(), (cm * 255).astype(np.uint8).tobytes(),
            json.dumps([words, negative, strength, control, steps, guidance, seed, W, H, control_end, self.mode(), rot % 4]).encode()])).hexdigest()[:20]
        cached = self.cache / f'{t.scene}-{tag or "job"}-{key}.png'
        if cached.exists():
            gen = np.asarray(Image.open(cached).convert('RGB')).astype(np.float32) / 255
        else:
            import torch
            pipe = self.load()
            up = np.rot90(crop, rot)
            src = Image.fromarray((np.clip(up, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((W, H), Image.LANCZOS)
            msk = Image.fromarray((np.clip(np.rot90(grow(cm, 4), rot), 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
            ctl = Image.fromarray(edges(np.asarray(src).astype(np.float32) / 255))
            g = torch.Generator('cpu').manual_seed(seed)
            args = dict(image=src, mask_image=msk, width=W, height=H, strength=strength, num_inference_steps=steps,
                        guidance_scale=guidance, generator=g, **self.encode(words, negative))
            if Painter.controlled:
                args.update(control_image=ctl, controlnet_conditioning_scale=control, control_guidance_end=control_end)
            out = pipe(**args).images[0]
            del args
            import gc
            gc.collect()
            torch.cuda.empty_cache()
            out = Image.fromarray(np.rot90(np.asarray(out), -rot).copy()).resize((x1 - x0, y1 - y0), Image.LANCZOS)
            out.save(cached)
            gen = np.asarray(out).astype(np.float32) / 255
            print(f'    painted {tag or "job"} {x1 - x0}x{y1 - y0} at {W}x{H}', flush=True)
        m = feather(cm, feather_px)[..., None]
        t.rgb[y0:y1, x0:x1] = crop * (1 - m) + gen * m
        return gen


    def repaint(self, t: Tex, prompt: str, *, strength=0.8, control=0.25, steps=32, guidance=7.0, seed=7,
                area=1024 * 1024, refine=0.3, negative: str = NEGATIVE, style: str | None = STYLE, tag='backdrop'):
        """A whole picture painted anew on the old one's composition (its light, its masses, a little of its edges),
        at SDXL's size, then brought back to full size and its detail painted in, tile by tile."""
        small = cv2.resize(t.rgb, _size_for(t.w, t.h, area), interpolation=cv2.INTER_AREA)
        tmp = Tex.__new__(Tex)
        tmp.scene, tmp.name, tmp.rgb, tmp.alpha = t.scene, t.name, small.copy(), np.ones(small.shape[:2], np.float32)
        tmp.h, tmp.w = small.shape[:2]
        self.paint(tmp, np.ones((tmp.h, tmp.w), np.float32), prompt, box=(0, 0, tmp.w, tmp.h), negative=negative,
                   strength=strength, control=control, steps=steps, guidance=guidance, seed=seed, area=area,
                   feather_px=0, style=style, tag=f'{tag}-base')
        t.rgb = cv2.resize(tmp.rgb, (t.w, t.h), interpolation=cv2.INTER_CUBIC)
        if refine:
            self.tiles(t, prompt, strength=refine, seed=seed + 1, negative=negative, style=style, tag=f'{tag}-tile')
        return t

    def tiles(self, t: Tex, prompt: str, *, strength=0.3, tile=1024, overlap=160, seed=7, negative: str = NEGATIVE,
              style: str | None = STYLE, control=0.5, tag='tile'):
        """paints detail into a big picture a tile at a time, the tiles blended over their overlaps"""
        xs = list(range(0, max(1, t.w - overlap), tile - overlap))
        ys = list(range(0, max(1, t.h - overlap), tile - overlap))
        acc = np.zeros_like(t.rgb)
        wsum = np.zeros((t.h, t.w, 1), np.float32)
        base = t.rgb.copy()
        for y in ys:
            for x in xs:
                x0, y0 = min(x, max(0, t.w - tile)), min(y, max(0, t.h - tile))
                x1, y1 = min(t.w, x0 + tile), min(t.h, y0 + tile)
                tmp = Tex.__new__(Tex)
                tmp.scene, tmp.name = t.scene, t.name
                tmp.rgb, tmp.alpha = base[y0:y1, x0:x1].copy(), np.ones((y1 - y0, x1 - x0), np.float32)
                tmp.h, tmp.w = y1 - y0, x1 - x0
                self.paint(tmp, np.ones((tmp.h, tmp.w), np.float32), prompt, box=(0, 0, tmp.w, tmp.h), negative=negative,
                           strength=strength, control=control, seed=seed, area=(x1 - x0) * (y1 - y0), feather_px=0,
                           style=style, tag=f'{tag}-{x0}-{y0}')
                # a weight that falls to zero at the tile's inner edges, so neighbours blend
                wy = np.minimum(np.arange(tmp.h) + 1, np.arange(tmp.h)[::-1] + 1).astype(np.float32)
                wx = np.minimum(np.arange(tmp.w) + 1, np.arange(tmp.w)[::-1] + 1).astype(np.float32)
                w = np.clip(np.minimum.outer(wy, wx) / overlap, 0.02, 1)[..., None]
                acc[y0:y1, x0:x1] += tmp.rgb * w
                wsum[y0:y1, x0:x1] += w
        t.rgb = acc / np.maximum(wsum, 1e-6)
        return t


def sheet(paths, out: Path, width=1600):
    """side by side previews (before | after) for review"""
    ims = [Image.open(p).convert('RGB') for p in paths]
    h = min(im.height for im in ims)
    ims = [im.resize((int(im.width * h / im.height), h)) for im in ims]
    s = Image.new('RGB', (sum(im.width for im in ims), h), 'white')
    x = 0
    for im in ims:
        s.paste(im, (x, 0))
        x += im.width
    s.thumbnail((width, width))
    s.save(out, quality=86)
    return out


def before_after(t: Tex, out: Path | None = None, box=None, width=1600) -> Path:
    src = Image.open(SRC / t.scene / 'src' / f'{t.name}.png').convert('RGB')
    now = Image.fromarray((np.clip(t.rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
    if box:
        src, now = src.crop(box), now.crop(box)
    out = out or (SRC / t.scene / 'out' / f'{t.name}--ba.jpg')
    out.parent.mkdir(parents=True, exist_ok=True)
    s = Image.new('RGB', (src.width * 2 + 16, src.height), 'white')
    s.paste(src, (0, 0))
    s.paste(now, (src.width + 16, 0))
    s.thumbnail((width, width))
    s.save(out, quality=86)
    return out


def textures(scene: str) -> list[str]:
    return sorted(p.stem for p in (SRC / scene / 'src').glob('*.png'))


if __name__ == '__main__':
    print('\n'.join(textures(sys.argv[1] if len(sys.argv) > 1 else 'gifts')))
