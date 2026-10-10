"""Corporate uniform: the rider and her white horse, dressed anew.

  * her hair: blond -> near black, her face painted anew (paint_head);
  * her tunic: green -> ivory linen; her cloak: red velvet -> deep turquoise velvet; the black skirt as it was;
  * the horse's bridle: brown leather -> turquoise leather (its gold fittings kept);
  * the cap stays Raphael's (rebrand.py); the hill behind becomes a dune at dusk (backdrops.py).
"""
from paint import (Painter, Tex, before_after, ellipse_mask, feather, gradient_map, lab, np, poly, rect, smooth, solid,
                   uvmask)
import cv2

FG = 'EW26_ShopApp_251208v3_compressed-optimized_0_ShopApp_fg_diffuse_V5'
FACE = ((990, 588), (118, 136))  # the face (texture pixels): centre, half axes
SKIN = ((985, 650), (140, 215))  # face and neck: their shadows are greenish (verdaccio) and stay as they are
HORSE = [(1300, 690), (2048, 690), (2048, 2048), (1150, 2048), (1150, 1270), (1300, 1250)]  # its head, neck and body (below the sleeves' pieces)
IVORY_LINEN = [(0.0, '#2b261d'), (0.25, '#6e6452'), (0.55, '#b9ab90'), (0.8, '#e4dac4'), (1.0, '#fcf8ee')]
TEAL_VELVET = [(0.0, '#020b0a'), (0.3, '#06302c'), (0.6, '#0f5c55'), (0.85, '#2a8a80'), (1.0, '#8fcfc4')]
DARK_HAIR = [(0.0, '#040302'), (0.4, '#140d09'), (0.7, '#2a1d15'), (0.9, '#4a3628'), (1.0, '#735a47')]
TURQ_LEATHER = [(0.0, '#03201d'), (0.5, '#0f6c64'), (1.0, '#5fc7bb')]


def angles(t: Tex):
    L = lab(t.rgb)
    return L, np.degrees(np.arctan2(L[..., 2], L[..., 1])), np.hypot(L[..., 1], L[..., 2])


def clean(m, r=3):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)


def remake(paint=True):
    t = Tex('uniform', FG)
    keepout = np.clip(uvmask(t, 'Mesh') + uvmask(t, 'checkout-hand.001') + uvmask(t, 'Cube.004') + rect(t, (380, 0, 780, 560)), 0, 1)
    face = feather(ellipse_mask(t, *FACE), 8)
    skin = feather(ellipse_mask(t, *SKIN), 10)

    # hair first (the new ivory would read as blond)
    L, ang, ch = angles(t)
    # blond hair is more coloured than the skin's olive shadows; the face itself is left to the painting (paint)
    blond = ((ch > 18) & (ang > 60) & (ang < 104) & (L[..., 0] > 25)).astype(np.float32)
    hair_zone = feather(ellipse_mask(t, (990, 600), (260, 290)), 10)
    gradient_map(t, smooth(clean(blond * hair_zone), t.rgb, r=4) * (1 - face) * (1 - keepout), DARK_HAIR, keep=0.1, keep_l=0.15)

    L, ang, ch = angles(t)
    green = ((ang > 95) & (ang < 200) & (ch > 8) & (L[..., 0] > 8)).astype(np.float32)
    # the white horse is shaded with greys and greens too: it stays out of the tunic's colour
    horse = feather(poly(t, HORSE), 6)
    gradient_map(t, smooth(clean(green), t.rgb, r=3) * (1 - keepout) * (1 - skin) * (1 - horse), IVORY_LINEN, keep=0.06,
                 keep_l=0.3, gamma=0.85)

    L, ang, ch = angles(t)
    red = ((ang < 56) & (ch > 12) & (L[..., 0] < 78)).astype(np.float32)
    gradient_map(t, smooth(clean(red), t.rgb, r=3) * (1 - keepout) * (1 - skin), TEAL_VELVET, keep=0.05, keep_l=0.35)

    # the bridle: the thin brown strap on the white horse (the horse's own whites and greys stay)
    L, ang, ch = angles(t)
    horse = rect(t, (1180, 700, 2048, 1700))
    leather = ((ch > 21) & (ang > 45) & (ang < 90) & (L[..., 0] < 56)).astype(np.float32) * horse  # the dark leather, not the mane's warm greys
    gradient_map(t, smooth(leather, t.rgb, r=2), TURQ_LEATHER, keep=0.05, keep_l=0.4)

    if paint:
        p = Painter()
        head = solid(t, 0.3) * feather(ellipse_mask(t, (990, 600), (250, 285)), 6) * (1 - uvmask(t, 'Mesh'))
        p.paint(t, head, 'portrait of a young woman with dark brown wavy hair falling to her shoulders, olive skin, dark '
                'eyes, dark eyebrows, calm gaze', strength=0.62, control=0.5, seed=8, tag='head')
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    import sys
    remake(paint='--no-paint' not in sys.argv)
