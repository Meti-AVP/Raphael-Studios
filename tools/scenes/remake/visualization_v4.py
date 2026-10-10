"""v4, 3D design & visualization: the drawing becomes a study after the antique, the way a Renaissance draughtsman drew
a statue: the headphones and their cord (the reference's idea) are drawn out, curls and a carved ear where they were,
and the face takes a statue's stillness (blank eyes). The drawing's texture is cut in a hundred charts, so all of it is
painted in the frame the camera sees (project.py) and carried back to the texture.

    1. node tools/scenes/remake/uvpass.mjs visualization 1.0 --meshes "Developer_fg,Dev_hand" --wide 1.8 --scale 1.6
          --out D:/RAhpel/.work-raphael/v4-art/visualization/uvpass-wide       (needs the dev server)
    2. python tools/scenes/remake/visualization_v4.py                          (SDXL; the dev server may be stopped)
"""
import cv2
import numpy as np
from PIL import Image

from paint import ART, Painter, Tex, before_after, feather, grow, lab, poly, rgb_of, uvmask
from project import Pass
from statue import base

FIG = 'EW26_Developer_251207v5_compressed-optimized_0_DevforPaintin_Developer_FG.001_BaseColor.1001'
DRAWN = ('academic study drawing in dark teal ink and graphite on old paper, fine cross-hatching, Renaissance '
         'draughtsmanship, drawn after the antique, master drawing')
NEG = ('headphones, headset, earphones, earmuffs, cable, wire, cord, strap, band, plastic, modern, photo, photograph, '
       'colour, oil painting, blurry, lowres, text, letters, watermark, frame')

# in the wide frame (uvpass-wide: 4608 x 2880), pixels
BAND = [(3036, 650), (3070, 616), (3168, 600), (3176, 1000), (3040, 1000)]
YOKE = [(3030, 985), (3180, 985), (3186, 1150), (3026, 1150)]
CUP = ((3100, 1285), (214, 172))
CORD = [(3068, 1400), (3040, 1450), (3020, 1500), (2990, 1600), (2948, 1700), (2915, 1800), (2887, 1900), (2862, 2000),
        (2835, 2100), (2812, 2200), (2795, 2300), (2780, 2400), (2770, 2480)]
HEAD_BOX = (2560, 520, 3440, 1540)  # what the painting sees of the head: the face too, so it knows a profile
EYE = ((2768, 1088), (44, 26))  # the eye, for the statue's blank stare
FACE_BOX = (2600, 940, 2940, 1240)


class Frame(Tex):
    """the wide frame as a picture the painter can work on"""

    def __init__(self, rgb: np.ndarray):
        self.scene, self.name = 'visualization', 'frame-wide'
        self.rgb = rgb.astype(np.float32).copy()
        self.alpha = np.ones(rgb.shape[:2], np.float32)
        self.h, self.w = rgb.shape[:2]


def mask_of(shape, *, polys=(), ellipses=(), lines=(), width=40) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.asarray(p, np.int32)], 255)
    for c, ax in ellipses:
        cv2.ellipse(m, c, ax, 0, 0, 360, 255, -1)
    for ln in lines:
        cv2.polylines(m, [np.asarray(ln, np.int32)], False, 255, width)
    return m.astype(np.float32) / 255


def inked(rgb: np.ndarray, ref: np.ndarray, ref_mask: np.ndarray) -> np.ndarray:
    """the painted strokes put back in the drawing's own ink: each lightness takes the hue the drawing has there"""
    L = lab(rgb)
    R = lab(ref)
    sel = ref_mask > 0.5
    bins = np.clip((R[..., 0][sel] / 2).astype(int), 0, 50)
    a_of = np.zeros(51, np.float32)
    b_of = np.zeros(51, np.float32)
    last = (float(np.median(R[..., 1][sel])), float(np.median(R[..., 2][sel])))
    for k in range(51):
        pick = bins == k
        if pick.sum() > 50:
            last = (float(np.median(R[..., 1][sel][pick])), float(np.median(R[..., 2][sel][pick])))
        a_of[k], b_of[k] = last
    k = np.clip((L[..., 0] / 2).astype(int), 0, 50)
    L[..., 1] = a_of[k]
    L[..., 2] = b_of[k]
    return rgb_of(L)


def across(rgb: np.ndarray, strip: np.ndarray) -> np.ndarray:
    """a thin, steep strip (the cord) filled with the drawing on either side of it: each row's run is the left side
    mirrored across its left edge, fading into the right side mirrored across its right edge (both edges meet the
    strokes beside them; a painting would draw a new strap there)"""
    out = rgb.copy()
    m = strip > 0.5
    w = rgb.shape[1]
    for y in np.nonzero(m.any(1))[0]:
        xs = np.nonzero(m[y])[0]
        runs = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1)
        for r in runs:
            xl, xr = int(r[0]), int(r[-1])
            n = xr - xl + 1
            k = np.arange(n)
            left = rgb[y, np.clip(xl - 1 - k, 0, w - 1)]
            right = rgb[y, np.clip(xr + 1 + (n - 1 - k), 0, w - 1)]
            t = ((k + 0.5) / n)[:, None]
            out[y, xl:xr + 1] = left * (1 - t) + right * t
    soft = feather(strip, 2.0)[..., None]
    return rgb * (1 - soft) + cv2.GaussianBlur(out, (0, 0), 0.6) * soft


def main():
    t = base('visualization', FIG)  # always from v3's drawing (art/ holds this script's own last result)
    p = Pass('visualization', 'wide')
    view = p.view(t)
    f = Frame(view)
    shape = (p.h, p.w)
    on = p.on.astype(np.float32)

    head = grow(mask_of(shape, polys=[BAND, YOKE], ellipses=[CUP]), 10) * on
    cord = mask_of(shape, lines=[CORD], width=52) * on
    eye = mask_of(shape, ellipses=[EYE]) * on

    painter = Painter()
    painter.paint(f, head, 'study drawing of the head of a classical Greek marble statue seen in profile, thick short '
                  'curly hair falling over a carved ear, the hair drawn in curls and locks', box=HEAD_BOX, negative=NEG,
                  style=DRAWN, strength=1.0, control=0.0, seed=81, tag='vis-head', feather_px=5)
    f.rgb = across(f.rgb, cord)
    painter.paint(f, feather(grow(eye, 10), 6), 'study drawing of the blank eye of a classical marble statue, smooth '
                  'carved eyeball without pupil or iris, calm eyelid', box=FACE_BOX, negative=NEG + ', pupil, iris',
                  style=DRAWN, strength=0.72, control=0.35, seed=83, tag='vis-eye', feather_px=4, area=768 * 768)

    changed = np.clip(feather(grow(head, 6), 4) + feather(grow(cord, 6), 4) + feather(grow(eye, 14), 6), 0, 1)
    ref = on * (1 - grow(changed, 40))
    f.rgb = view * (1 - changed[..., None]) + inked(f.rgb, view, ref) * changed[..., None]
    p.save('painted.jpg', f.rgb)
    p.save('before.jpg', view)
    charts = uvmask(t)
    moved = p.back(t, f.rgb, changed, charts)
    print(f'  texels changed: {int((moved > 0.05).sum())}', flush=True)
    t.save()
    print(' ', before_after(t), flush=True)


if __name__ == '__main__':
    main()
