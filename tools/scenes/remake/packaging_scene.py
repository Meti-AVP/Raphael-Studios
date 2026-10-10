"""Packaging (named packaging_scene.py: a packaging.py here would hide the Python library of that name): the cheetah becomes a bronze cat of old Egypt that walks (Bastet's kind, cast in bronze with a patina
of turquoise in its hollows and gold at its ears), dressed in lapis blue instead of red velvet, the gold strap kept.

The cheetah's texture is chart-packed (its fur and its cloth cut into islands), so it is recoloured island by
island: an island that is mostly red cloth is cloth (and the gold in it is the strap), any other is fur. The fur
loses its spots (filled from the fur around them) and is cast in bronze; the head is then painted anew (paint_head).
"""
import cv2

from paint import (SRC, Image, Painter, Tex, before_after, bleed, feather, gradient_map, grow, lab, np, rgb_of, shrink,
                   smooth)

FG = 'EW26_Shipping_251204_compressed-optimized_0_Shipping_fg_Merged_V5'
UV = SRC / 'packaging' / 'uv'

BRONZE = [(0.0, '#0a0602'), (0.3, '#24180a'), (0.55, '#4e3818'), (0.75, '#86622c'), (0.9, '#b38a44'), (0.97, '#d6b26a'), (1.0, '#ecd49a')]
PATINA = '#3f8f7f'
HEAD = (640, 740, 1090, 1110)  # the face's island (x0, y0, x1, y1)
LAPIS = [(0.0, '#02030a'), (0.4, '#0b1338'), (0.7, '#1a2a62'), (0.9, '#36508e'), (1.0, '#8796c4')]


def uv(mesh: str) -> np.ndarray:
    return (np.asarray(Image.open(UV / f'{FG}--{mesh}.png')) > 0).astype(np.uint8)


def islands():
    """the cheetah's islands, per pixel: fur, cloth or the gold strap. The cloth is a dark red (Lab hue angle under
    ~60 degrees), fur and its spots are yellow-brown (80 and more), the strap is gold with engraved knots lying on
    the cloth. An island that is mostly cloth stays cloth where in doubt; an island's rim takes its inside's class."""
    t = Tex('packaging', FG)
    cheetah = uv('Cheetah')
    L = lab(t.rgb)
    l = L[..., 0]
    ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
    chroma = np.hypot(L[..., 1], L[..., 2])
    std = np.sqrt(np.maximum(cv2.blur(l * l, (9, 9)) - cv2.blur(l, (9, 9)) ** 2, 0))
    red = ((ang < 62) & (chroma > 7) & (l < 40)) & (cheetah > 0)
    n, lbl = cv2.connectedComponents(cheetah, connectivity=8)
    frac = np.bincount(lbl.ravel(), weights=red.ravel().astype(np.float64), minlength=n) / np.maximum(np.bincount(lbl.ravel(), minlength=n), 1)
    cloth_isl = (frac[lbl] > 0.35) & (cheetah > 0)
    near_red = cv2.dilate(red.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))) > 0
    strap = cloth_isl & near_red & ~red & (ang > 50) & (ang < 80) & (chroma > 26) & (std > 4)
    strap = cv2.morphologyEx(strap.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    strap = cv2.morphologyEx(strap, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    body = cloth_isl & ~strap & ~red & (ang > 72) & (chroma > 12) & (l > 28)
    body = cv2.morphologyEx(body.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    fur = ((cheetah > 0) & ~cloth_isl) | body
    cloth = cloth_isl & ~strap & ~body
    # the rim (2 px inside the islands' edges, anti-aliased with the padding) takes its inside's class
    core = cv2.erode(cheetah, np.ones((5, 5), np.uint8)) > 0
    rim = (cheetah > 0) & ~core
    classes = np.stack([fur & core, cloth & core, strap & core]).astype(np.uint8)
    spread = np.stack([cv2.dilate(c, np.ones((7, 7), np.uint8)) for c in classes]).astype(np.float32)
    pick = np.argmax(spread + np.array([0.02, 0.01, 0])[:, None, None], 0)
    fur = np.where(rim, pick == 0, fur)
    cloth = np.where(rim, pick == 1, cloth)
    strap = np.where(rim, pick == 2, strap)
    f = lambda m: m.astype(np.float32)
    return t, f(cheetah), f(fur), f(cloth), f(strap)


def unspot(t: Tex, fur: np.ndarray):
    """the cheetah's spots, rings and tear lines, filled from the fur around them"""
    L = lab(t.rgb)[..., 0]
    # black-hat: how much darker a pixel is than the fur around it, for anything narrower than the kernel
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
    hat = cv2.morphologyEx(L.astype(np.float32), cv2.MORPH_BLACKHAT, k)
    spot = (hat > 6).astype(np.float32) * fur
    spot = feather(grow(spot, 3), 1.5) * fur
    rgb8 = (np.clip(t.rgb, 0, 1) * 255).astype(np.uint8)
    filled = cv2.inpaint(rgb8, (spot > 0.3).astype(np.uint8) * 255, 7, cv2.INPAINT_TELEA).astype(np.float32) / 255
    m = spot[..., None]
    t.rgb = t.rgb * (1 - m) + filled * m


def blur_in(x: np.ndarray, m: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian blur of x using only the pixels where m is set (no colour leaks in from the padding)"""
    return cv2.GaussianBlur(x * m, (0, 0), sigma) / np.maximum(cv2.GaussianBlur(m, (0, 0), sigma), 1e-4)


def bronze(t: Tex, fur: np.ndarray, inside: np.ndarray):
    """cast in bronze: the fur's light and shade (its form) without its pattern, a little of its hair as chasing on
    the metal, then the bronze ramp and a turquoise patina in the hollows"""
    L = lab(t.rgb)
    l = L[..., 0]
    m = fur * inside
    # the form: a closing (dilate, then erode) wipes out every dark mark narrower than its disk (spots, rings,
    # tear lines); the padding is first filled with the islands' own values so their edges do not darken
    filled = np.where(m > 0.5, l, blur_in(l, m, 12)).astype(np.float32)
    disk = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    closed = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, disk(16))
    head = np.zeros_like(m)
    head[HEAD[1]:HEAD[3], HEAD[0]:HEAD[2]] = 1  # the face keeps its features for the repaint (paint_head)
    closed = np.where(head > 0, cv2.morphologyEx(filled, cv2.MORPH_CLOSE, disk(3)), closed)
    form = blur_in(closed, m, 5)
    hair = l - blur_in(l, m, 1.6)
    big = blur_in(l, m, 30)
    mean = l[m > 0.5].mean()
    shaped = form + 0.3 * np.clip(hair, -6, 6) - 0.45 * (big - mean)  # a white belly is not a brighter metal
    L[..., 0] = np.where(m > 0.5, np.clip(shaped, 0, 100), l)
    L[..., 1:] = np.where(m[..., None] > 0.5, L[..., 1:] * 0.3, L[..., 1:])
    t.rgb = np.where(m[..., None] > 0.5, rgb_of(L), t.rgb)
    gradient_map(t, m, BRONZE, keep=0.0, keep_l=0.05, gamma=1.7)
    l = lab(t.rgb)[..., 0]
    hollow = np.clip((blur_in(l, m, 9) - l) / 8, 0, 1)
    shade = np.clip((45 - l) / 20, 0, 1)
    w = np.clip(hollow * 0.6 * shade, 0, 0.45) * m * shrink(inside, 4)
    pat = np.asarray([[int(PATINA[i:i + 2], 16) / 255 for i in (1, 3, 5)]], np.float32)
    tint = pat * (0.35 + 0.9 * (l[..., None] / 100))
    t.rgb = t.rgb * (1 - w[..., None]) + np.clip(tint, 0, 1) * w[..., None]


def cheetah(paint=True):
    t, inside, fur, cloth, strap = islands()
    # the islands' outer 2 px are a blend with the old padding: they are refilled with the padding, from the core
    core = shrink(inside, 2)
    unspot(t, fur * core)
    bronze(t, fur, core)
    gradient_map(t, cloth * core, LAPIS, keep=0.06, keep_l=0.35)
    region = np.zeros_like(inside)
    region[:, :1800] = 1
    bleed(t, core * region + (1 - region), region)
    if paint:
        # the head: a cat's, cast in bronze, with a gold ring in its ear (Bastet's kind), on the cheetah's face
        x0, y0, x1, y1 = HEAD
        m = np.zeros_like(fur)
        m[y0:y1, x0:x1] = 1
        Painter().paint(t, feather(m * fur * core, 3), 'the head of an ancient Egyptian bronze cat statue, polished dark bronze '
                        'with warm gold highlights, a gold ring in its ear, inlaid eyes, Bastet', strength=0.62,
                        control=0.55, seed=51, tag='cat-head')
    if paint:
        pedestal(t, Painter())
    t.save()
    print(' ', before_after(t))
    return t


def pedestal(t: Tex, p: Painter):
    """the stand's gilded reliefs: arabesques and star roundels of Mamluk metalwork instead of Renaissance scenes
    (a tall strip in the texture: painted in three parts, each a little over its neighbour)"""
    stand = uv('Shopping_Stand').astype(np.float32)
    for i, (y0, y1) in enumerate([(580, 1060), (1020, 1500), (1460, 2000)]):
        m = np.zeros_like(stand)
        m[y0:y1, 1912:2048] = 1  # the frieze of roundels (the plain top and side, to its left, stay)
        p.paint(t, feather(m * stand, 3), 'a gilded bronze relief frieze with Mamluk arabesques, interlacing geometric '
                'bands and eight pointed star roundels, finely chased', strength=0.72, control=0.5, seed=81 + i, rot=1,
                style='Italian Renaissance oil painting, trompe l oeil gilded relief, warm light', tag=f'pedestal-{i}')


if __name__ == '__main__':
    import sys
    cheetah(paint='--no-paint' not in sys.argv)
