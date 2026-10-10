"""Prepare every image of the site from the client's files (see media.json).

    py tools/content/build_media.py [--only id1,id2] [--force]

Reads   RAPHAEL_CONTENT (default D:/RAhpel/Raphael Studios Content): the 2026 PDF and Links/*.psd
        RAPHAEL_ART     (default D:/RAhpel/.work-raphael/art): public-domain paintings (tools/content/fetch_art.py)
Writes  src/assets/media/<id>.jpg            the picture (upscaled if the source is small), sRGB, longest side <= max
        src/assets/media/<id>.subject.png    the subject on transparency (items with "cut")
        src/assets/media/<id>.plate.jpg      the picture with the subject painted out (what shows behind it when it moves)
        src/assets/media/<id>.depth.png      relative depth, near = white (items with "depth")
        src/content/media.generated.json     sizes, colours and flags the components read
Existing outputs are kept unless --force: the models are slow on a CPU.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
import ai  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CONTENT = Path(os.environ.get('RAPHAEL_CONTENT', r'D:/RAhpel/Raphael Studios Content'))
ART = Path(os.environ.get('RAPHAEL_ART', r'D:/RAhpel/.work-raphael/art'))
PDF = CONTENT / 'raphael Studios Story 2026 final.pdf'
OUT = ROOT / 'src' / 'assets' / 'media'
META = ROOT / 'src' / 'content' / 'media.generated.json'
Image.MAX_IMAGE_PIXELS = None
DEFAULT_MAX = 2400


def load_source(src: str) -> Image.Image:
    kind, _, rest = src.partition(':')
    if kind == 'pdf':
        import fitz

        page_no, xref = (int(v) for v in rest.split(':'))
        doc = fitz.open(PDF)
        info = next(i for i in doc[page_no - 1].get_images(full=True) if i[0] == xref)
        pix = fitz.Pixmap(doc, xref)
        if info[1]:  # soft mask: the image has transparency
            pix = fitz.Pixmap(pix, fitz.Pixmap(doc, info[1]))
        if pix.n - pix.alpha > 3 or (pix.colorspace and pix.colorspace.name not in ('DeviceRGB', 'DeviceGray')):
            pix = fitz.Pixmap(fitz.csRGB, pix)
        mode = 'RGBA' if pix.alpha else ('L' if pix.n == 1 else 'RGB')
        img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
        return img if mode != 'L' else img.convert('RGB')
    if kind == 'psd':
        return Image.open(CONTENT / 'Links' / f'{rest}.psd').convert('RGBA')
    if kind == 'art':
        return Image.open(ART / rest).convert('RGB')
    raise ValueError(src)


def has_real_alpha(img: Image.Image) -> bool:
    if img.mode != 'RGBA':
        return False
    a = np.asarray(img.getchannel('A'))
    return bool((a < 250).mean() > 0.002)


def colours(img: Image.Image) -> dict:
    """Average colour of the top and bottom thirds: a two-stop placeholder while the image loads."""
    small = img.convert('RGB').resize((24, 24), Image.BOX)
    arr = np.asarray(small, dtype=np.float32)
    hexes = []
    for part in (arr[:8], arr[16:]):
        r, g, b = part.reshape(-1, 3).mean(0)
        hexes.append('#%02x%02x%02x' % (int(r), int(g), int(b)))
    return {'top': hexes[0], 'bottom': hexes[1]}


def clean_mask(mask: Image.Image, keep: float = 0.01) -> Image.Image:
    """Drop specks: keep connected regions larger than `keep` of the largest one, then feather 1 px."""
    import cv2

    m = np.asarray(mask)
    binary = (m > 96).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if n > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        big = areas.max()
        allowed = np.zeros(n, dtype=bool)
        allowed[1:] = areas >= big * keep
        region = allowed[labels]
        region = cv2.dilate(region.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        m = np.where(region, m, 0).astype(np.uint8)
    return Image.fromarray(m).filter(ImageFilter.GaussianBlur(0.6))


def plate(img: Image.Image, mask: Image.Image) -> Image.Image:
    """The background with the subject painted out, so the parallax never shows a double."""
    import cv2

    rgb = np.asarray(img.convert('RGB'))
    m = (np.asarray(mask) > 40).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((25, 25), np.uint8))
    scale = 0.25
    small = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    msmall = cv2.resize(m, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST)
    filled = cv2.inpaint(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), msmall, 9, cv2.INPAINT_TELEA)
    filled = cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)
    filled = cv2.resize(filled, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_CUBIC)
    filled = cv2.GaussianBlur(filled, (0, 0), 6)
    soft = cv2.GaussianBlur(m, (0, 0), 8).astype(np.float32)[..., None] / 255.0
    out = rgb.astype(np.float32) * (1 - soft) + filled.astype(np.float32) * soft
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def build(item: dict, force: bool) -> dict:
    iid = item['id']
    master_path = OUT / f'{iid}.jpg'
    alpha_master = OUT / f'{iid}.png'
    entry = {k: item[k] for k in ('id', 'alt', 'chapter') if k in item}
    t0 = time.time()
    if force or not (master_path.exists() or alpha_master.exists()):
        img = load_source(item['src'])
        img = ImageOps.exif_transpose(img)
        up = float(item.get('up', 1))
        if up > 1:
            img = ai.upscale(img, up)
        limit = int(item.get('max', DEFAULT_MAX))
        if max(img.size) > limit:
            img.thumbnail((limit, limit), Image.LANCZOS)
        if has_real_alpha(img):
            img.save(alpha_master, optimize=True)
            master_path.unlink(missing_ok=True)
        else:
            img.convert('RGB').save(master_path, quality=90, subsampling=0, optimize=True, progressive=True)
            alpha_master.unlink(missing_ok=True)
    master = master_path if master_path.exists() else alpha_master
    img = Image.open(master)
    img.load()
    entry.update({'file': master.name, 'width': img.width, 'height': img.height, 'alpha': master.suffix == '.png', **colours(img)})

    if item.get('cut'):
        sub_path, plate_path = OUT / f'{iid}.subject.png', OUT / f'{iid}.plate.jpg'
        if force or not sub_path.exists():
            mask = ai.cutout_mask(img)
            if item.get('depthUnion'):
                d = np.asarray(ai.depth(img), dtype=np.float32) / 255.0
                t = float(item['depthUnion'])
                near = smoothstep(t - 0.05, t + 0.05, d)
                mask = Image.fromarray(np.maximum(np.asarray(mask, dtype=np.float32), near * 255).astype(np.uint8))
            mask = clean_mask(mask)
            ai.cutout(img.convert('RGB'), mask).save(sub_path, optimize=True)
            plate(img, mask).save(plate_path, quality=86, optimize=True, progressive=True)
        sub = Image.open(sub_path)
        bbox = sub.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, img.width, img.height)
        entry['subject'] = {'file': sub_path.name, 'plate': plate_path.name, 'bbox': [round(v / s, 4) for v, s in zip(bbox, (img.width, img.height, img.width, img.height))]}

    if item.get('lines'):
        # a drawing of the picture (edges), for the "from wireframe to render" reveal of the 3D chapter
        import cv2

        lines_path = OUT / f'{iid}.lines.png'
        if force or not lines_path.exists():
            gray = cv2.cvtColor(np.asarray(img.convert('RGB')), cv2.COLOR_RGB2GRAY)
            gray = cv2.bilateralFilter(gray, 9, 60, 9)
            v = float(np.median(gray))
            edges = cv2.Canny(gray, int(max(0, 0.55 * v)), int(min(255, 1.25 * v)), L2gradient=True)
            edges = cv2.dilate(edges, np.ones((2, 2), np.uint8))
            edges = cv2.GaussianBlur(edges, (0, 0), 0.7)
            rgba = np.zeros((*edges.shape, 4), dtype=np.uint8)
            rgba[..., :3] = (62, 224, 209)
            rgba[..., 3] = edges
            Image.fromarray(rgba, 'RGBA').save(lines_path, optimize=True)
        entry['lines'] = lines_path.name

    if item.get('depth'):
        depth_path = OUT / f'{iid}.depth.png'
        if force or not depth_path.exists():
            d = ai.depth(img, short_side=770)
            d = d.resize((max(256, img.width // 2), max(256, img.height // 2)), Image.BICUBIC)
            d.save(depth_path, optimize=True)
        entry['depth'] = depth_path.name

    entry['seconds'] = round(time.time() - t0, 1)
    return entry


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    items = json.loads((Path(__file__).parent / 'media.json').read_text(encoding='utf-8'))['items']
    only = {s for s in args.only.split(',') if s}
    OUT.mkdir(parents=True, exist_ok=True)
    META.parent.mkdir(parents=True, exist_ok=True)
    meta = json.loads(META.read_text(encoding='utf-8')) if META.exists() else {}
    for item in items:
        if only and item['id'] not in only:
            continue
        entry = build(item, args.force)
        meta[item['id']] = entry
        print(f"{item['id']:<22} {entry['width']}x{entry['height']}{' +subject' if 'subject' in entry else ''}{' +depth' if 'depth' in entry else ''}  {entry['seconds']}s", flush=True)
        META.write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding='utf-8')
    ids = [i['id'] for i in items]
    ordered = {k: meta[k] for k in ids if k in meta}
    for e in ordered.values():
        e.pop('seconds', None)
    META.write_text(json.dumps(ordered, indent=1, ensure_ascii=False), encoding='utf-8')
    print('done', len(ordered), 'items')


if __name__ == '__main__':
    main()
