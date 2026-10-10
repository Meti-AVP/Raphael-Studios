"""Image models used to prepare the site's media (run on the CPU, nothing leaves the machine).

- upscale(): Real-ESRGAN "realesr-general-x4v3" (BSD-3-Clause), for the low-resolution images of the 2026 PDF.
- cutout():  BiRefNet-lite (MIT), the foreground mask used to lift people and products out of their photos.
- depth():   Depth Anything V2 Small (Apache-2.0), relative depth for the painted 2.5D scenes.

The weights are not part of the project. Point RAPHAEL_MODELS at the folder that holds them:
  realesr-general-x4v3.pth  https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth
  birefnet-lite.onnx        https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx
  depth-anything-v2-small.onnx  https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

MODELS = Path(os.environ.get('RAPHAEL_MODELS', r'D:/RAhpel/.work-raphael/models'))
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ---------------------------------------------------------------- Real-ESRGAN (SRVGGNetCompact)
@lru_cache(maxsize=1)
def _esrgan():
    import torch
    from torch import nn

    class SRVGGNetCompact(nn.Module):
        # the architecture of realesr-general-x4v3: 64 features, 32 convolutions, PReLU, pixel shuffle x4
        def __init__(self, num_feat=64, num_conv=32, upscale=4):
            super().__init__()
            self.upscale = upscale
            body = [nn.Conv2d(3, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
            for _ in range(num_conv):
                body += [nn.Conv2d(num_feat, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
            body.append(nn.Conv2d(num_feat, 3 * upscale * upscale, 3, 1, 1))
            self.body = nn.ModuleList(body)
            self.upsampler = nn.PixelShuffle(upscale)

        def forward(self, x):
            out = x
            for layer in self.body:
                out = layer(out)
            out = self.upsampler(out)
            return out + nn.functional.interpolate(x, scale_factor=self.upscale, mode='nearest')

    state = torch.load(MODELS / 'realesr-general-x4v3.pth', map_location='cpu', weights_only=True)
    state = state.get('params_ema') or state.get('params') or state
    net = SRVGGNetCompact()
    net.load_state_dict(state, strict=True)
    net.eval()
    torch.set_num_threads(max(1, (os.cpu_count() or 4) - 1))
    return net


def upscale(img: Image.Image, scale: float) -> Image.Image:
    """Upscale by `scale` (<= 4): the network makes x4, the result is resized down to the asked size."""
    import torch

    if scale <= 1:
        return img
    alpha = img.getchannel('A') if img.mode == 'RGBA' else None
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32) / 255.0
    x = torch.from_numpy(rgb.transpose(2, 0, 1)).unsqueeze(0)
    tile = 256
    _, _, h, w = x.shape
    out = torch.zeros((1, 3, h * 4, w * 4))
    with torch.inference_mode():
        # tiles with an overlap, so large images fit in memory and seams do not show
        pad = 12
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
                py0, px0 = max(y0 - pad, 0), max(x0 - pad, 0)
                py1, px1 = min(y1 + pad, h), min(x1 + pad, w)
                res = _esrgan()(x[:, :, py0:py1, px0:px1])
                oy, ox = (y0 - py0) * 4, (x0 - px0) * 4
                out[:, :, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = res[:, :, oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
    arr = (out.squeeze(0).clamp(0, 1).numpy().transpose(1, 2, 0) * 255.0 + 0.5).astype(np.uint8)
    big = Image.fromarray(arr)
    size = (round(img.width * scale), round(img.height * scale))
    if big.size != size:
        big = big.resize(size, Image.LANCZOS)
    if alpha is not None:
        big.putalpha(alpha.resize(size, Image.LANCZOS))
    return big


# ---------------------------------------------------------------- BiRefNet (foreground mask)
@lru_cache(maxsize=1)
def _birefnet():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = max(1, (os.cpu_count() or 4) - 1)
    return ort.InferenceSession(str(MODELS / 'birefnet-lite.onnx'), opts, providers=['CPUExecutionProvider'])


def cutout_mask(img: Image.Image) -> Image.Image:
    """Foreground probability as an 8-bit mask the size of `img`."""
    sess = _birefnet()
    rgb = img.convert('RGB').resize((1024, 1024), Image.BILINEAR)
    x = (np.asarray(rgb, dtype=np.float32) / 255.0 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[-1]
    prob = 1.0 / (1.0 + np.exp(-out[0, 0]))
    mask = Image.fromarray((prob * 255.0 + 0.5).astype(np.uint8)).resize(img.size, Image.LANCZOS)
    return mask


def cutout(img: Image.Image, mask: Image.Image | None = None, tighten: float = 0.0) -> Image.Image:
    """The subject on a transparent background. `tighten` (0..1) pushes soft edges in, against halos."""
    mask = mask or cutout_mask(img)
    if tighten:
        m = np.asarray(mask, dtype=np.float32) / 255.0
        m = np.clip((m - tighten * 0.5) / (1.0 - tighten * 0.5), 0, 1)
        mask = Image.fromarray((m * 255.0 + 0.5).astype(np.uint8))
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


# ---------------------------------------------------------------- Depth Anything V2 Small
@lru_cache(maxsize=1)
def _depth():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = max(1, (os.cpu_count() or 4) - 1)
    return ort.InferenceSession(str(MODELS / 'depth-anything-v2-small.onnx'), opts, providers=['CPUExecutionProvider'])


def depth(img: Image.Image, short_side: int = 518) -> Image.Image:
    """Relative depth, near = white, far = black, 8-bit, the size of `img`."""
    sess = _depth()
    w, h = img.size
    s = short_side / min(w, h)
    tw, th = max(14, round(w * s / 14) * 14), max(14, round(h * s / 14) * 14)
    rgb = img.convert('RGB').resize((tw, th), Image.BICUBIC)
    x = (np.asarray(rgb, dtype=np.float32) / 255.0 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {sess.get_inputs()[0].name: x})[0]
    d = d.reshape(d.shape[-2], d.shape[-1])
    d = (d - d.min()) / max(1e-6, d.max() - d.min())
    return Image.fromarray((d * 255.0 + 0.5).astype(np.uint8)).resize((w, h), Image.BICUBIC)
