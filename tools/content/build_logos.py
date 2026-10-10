"""Client logos for "Brands that trust us" (company profile p3), as one-colour masks.

    py tools/content/build_logos.py

Each logo becomes black ink on transparency (src/assets/logos/<name>.png). The site paints them through CSS
`mask-image`, so one file serves the calm grey wall and the turquoise hover. White inside a logo (the text of
the Orange square, the Virgin box...) becomes transparent, the way a one-colour print would treat it.
Three logos are vector drawings in the PDF, not images: they are rendered from the page at 600 dpi.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import ai  # noqa: E402
from build_media import PDF, ROOT  # noqa: E402

OUT = ROOT / 'src' / 'assets' / 'logos'
META = ROOT / 'src' / 'content' / 'logos.generated.json'

RASTER = {
    101: 'totalenergies', 102: 'hany-saad', 103: 'linah-farms', 104: 'super-kids', 106: 'parkville',
    107: 'erada-finance', 109: 'al-mokhtabar', 111: 'electrostar', 113: 'kharafi-national', 115: 'smart-furniture',
    117: 'adnoc-voyager', 119: 'zadea', 121: 'virgin-megastore', 122: 'orange', 123: 'rixos', 124: 'zaro', 126: 'btm',
    128: 'sami-amin', 129: 'zen-architects', 131: 'magic-pharma', 132: 'iqos', 133: 'concentrix',
    135: 'wintershall-dea', 136: 'heineken', 138: 'domty', 140: 'maridive', 141: 'catrion', 78: 'mpg',
    79: 'transmar', 81: 'saudi-catering', 83: 'arma', 84: 'toyota', 86: 'al-ahram', 88: 'oxi', 90: 'brix',
    92: 'hla', 94: 'rivoli', 96: 'el-hanim', 98: 'crystal', 99: 'shutterstock',
}
# vector logos: clip rectangles on page 3, in PDF points
VECTOR = {'philip-morris': (562, 146, 662, 212), 'bobai': (156, 272, 266, 306), 'starville': (156, 328, 258, 362)}


def raster(doc, xref: int) -> Image.Image:
    import fitz

    page = doc[2]
    info = next(i for i in page.get_images(full=True) if i[0] == xref)
    pix = fitz.Pixmap(doc, xref)
    if info[1]:
        pix = fitz.Pixmap(pix, fitz.Pixmap(doc, info[1]))
    if pix.n - pix.alpha > 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    mode = 'RGBA' if pix.alpha else 'RGB'
    img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
    return ai.upscale(img, 3)


def ink(img: Image.Image) -> Image.Image:
    """Black ink with alpha = how much a pixel reads as 'logo' rather than paper."""
    rgba = img.convert('RGBA')
    white = Image.new('RGBA', rgba.size, (255, 255, 255, 255))
    white.alpha_composite(rgba)
    a = np.asarray(white.convert('RGB'), dtype=np.float32) / 255.0
    lum = a @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    mx, mn = a.max(2), a.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    v = np.clip(np.maximum((1.0 - lum) * 1.55, sat * 1.8), 0, 1)
    v = np.where(v < 0.1, 0, v)
    out = np.zeros((*v.shape, 4), dtype=np.uint8)
    out[..., 3] = (v * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    bbox = im.getchannel('A').point(lambda x: 255 if x > 30 else 0).getbbox()
    if bbox:
        pad = 6
        im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(im.width, bbox[2] + pad), min(im.height, bbox[3] + pad)))
    return im


def main() -> None:
    import fitz

    OUT.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    meta = {}
    sources = {name: ('raster', xref) for xref, name in RASTER.items()}
    sources.update({name: ('vector', rect) for name, rect in VECTOR.items()})
    for name, (kind, ref) in sorted(sources.items()):
        img = raster(doc, ref) if kind == 'raster' else Image.frombytes(
            'RGB', *(lambda p: ((p.width, p.height), p.samples))(doc[2].get_pixmap(dpi=600, clip=fitz.Rect(*ref))))
        logo = ink(img)
        if max(logo.size) > 520:
            logo.thumbnail((520, 520), Image.LANCZOS)
        logo.save(OUT / f'{name}.png', optimize=True)
        alpha = np.asarray(logo.getchannel('A'), dtype=np.float32) / 255.0
        meta[name] = {'width': logo.width, 'height': logo.height, 'coverage': round(float(alpha.mean()), 4)}
        print(f'{name:<18} {logo.width}x{logo.height} ink {meta[name]["coverage"]:.2f}', flush=True)
    META.write_text(json.dumps(meta, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
