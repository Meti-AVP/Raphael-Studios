"""The scenes that are a still painting by Raphael himself (public domain): composed for a computer screen (1920 x 1200)
and a phone (804 x 1748), with a timeline that only sets the bloom.

    py tools/scenes/stills.py

    photography  Portrait of Baldassare Castiglione (c. 1514-1515, Louvre)
    partners     The School of Athens (1509-1511, Vatican), Plato and Aristotle at its centre

Sources: D:/RAhpel/.work-raphael/art (env RAPHAEL_ART); Wikimedia Commons downloads.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[2]
ART = Path(os.environ.get('RAPHAEL_ART', 'D:/RAhpel/.work-raphael/art'))
OUT = ROOT / 'public' / 'scenes'


def vignette(im: Image.Image, strength=0.55) -> Image.Image:
    w, h = im.size
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - w * 0.5) / (w * 0.75)) ** 2 + ((yy - h * 0.5) / (h * 0.75)) ** 2)
    v = np.clip(1.15 - d * strength, 0.5, 1)[..., None]
    return Image.fromarray((np.asarray(im).astype(np.float32) * v).clip(0, 255).astype(np.uint8))


def portrait_on_ground(src: Image.Image, w: int, h: int, scale_h: float, cx: float, cy: float) -> Image.Image:
    """A portrait painting set into its own blurred ground (a wide frame from a tall picture)."""
    W, H = src.size
    a = np.asarray(src.resize((200, 250)))
    border = np.concatenate([a[:10].reshape(-1, 3), a[-10:].reshape(-1, 3), a[:, :10].reshape(-1, 3), a[:, -10:].reshape(-1, 3)])
    bg = tuple(int(v) for v in np.median(border, 0))
    canvas = Image.new('RGB', (w, h), bg)
    g = src.resize((int(w * 1.2), int(w * 1.2 * H / W))).filter(ImageFilter.GaussianBlur(60))
    canvas.paste(g, ((w - g.width) // 2, (h - g.height) // 2))
    ph = int(h * scale_h)
    pw = int(ph * W / H)
    p = src.resize((pw, ph), Image.LANCZOS)
    m = Image.new('L', (pw, ph), 255)
    m = ImageOps.expand(m.resize((pw - 80, ph - 80)), 40, 0).filter(ImageFilter.GaussianBlur(28))
    canvas.paste(p, (int(cx * w - pw / 2), int(cy * h - ph / 2)), m)
    return vignette(canvas)


def fresco(src: Image.Image, w: int, h: int, focus: tuple[float, float], zoom: float) -> Image.Image:
    """A crop of a wide fresco around a point (fractions of the picture), zoom > 1 closes in."""
    W, H = src.size
    ar = w / h
    ch = H / zoom
    cw = ch * ar
    if cw > W:
        cw = W
        ch = cw / ar
    x0 = min(max(0, focus[0] * W - cw / 2), W - cw)
    y0 = min(max(0, focus[1] * H - ch / 2), H - ch)
    return vignette(src.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((w, h), Image.LANCZOS), 0.4)


def write(scene: str, desktop: Image.Image, mobile: Image.Image, bloom=2.0) -> None:
    d = OUT / scene
    d.mkdir(parents=True, exist_ok=True)
    # AVIF through sharp (the project's own image library): Pillow builds often lack an AVIF encoder
    for im, name in ((desktop, 'poster-d'), (mobile, 'poster-m')):
        png = d / f'{name}.tmp.png'
        im.save(png)
        js = (f"require('sharp')({json.dumps(str(png))}).avif({{quality:56,effort:6}})"
              f".toFile({json.dumps(str(d / (name + '.avif')))}).then(()=>require('fs').unlinkSync({json.dumps(str(png))}))")
        subprocess.run(['node', '-e', js], check=True, cwd=ROOT)
    manifest = {
        'id': scene,
        'camera': None,
        'assets': [],
        'posters': {
            'desktop': {'url': 'poster-d.avif', 'width': desktop.width, 'height': desktop.height},
            'mobile': {'url': 'poster-m.avif', 'width': mobile.width, 'height': mobile.height},
        },
    }
    (d / 'scene.json').write_text(json.dumps(manifest, indent=1))
    timeline = {'length': 10, 'objects': {'effects': {'static': {'bloom': {'intensity': bloom}, 'sectionTransition': {'fadeCenter': {'x': 0, 'y': 0, 'z': 0}}}, 'tracks': {}}}}
    (d / 'timeline.json').write_text(json.dumps(timeline))
    print(scene, desktop.size, mobile.size, [(p.name, p.stat().st_size // 1024) for p in d.glob('poster-*.avif')])


def main() -> None:
    castiglione = Image.open(ART / 'castiglione.jpg').convert('RGB')
    write('photography', portrait_on_ground(castiglione, 1920, 1188, 1.08, 0.62, 0.56), portrait_on_ground(castiglione, 804, 1748, 0.86, 0.5, 0.52))
    school = Image.open(ART / 'school-of-athens.jpg').convert('RGB')
    # Plato and Aristotle stand at the vanishing point, about (0.5, 0.42) of the fresco
    write('partners', fresco(school, 1920, 1200, (0.5, 0.46), 1.25), fresco(school, 804, 1748, (0.5, 0.45), 1.9))


if __name__ == '__main__':
    main()
