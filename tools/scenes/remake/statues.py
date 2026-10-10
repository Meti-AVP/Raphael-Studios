"""v4: the people of every scene in white marble (see statue.py). One function per scene; the studio's products, its
turquoise accents (a turban, a cap, a bridle) and the rooms around the figures keep their colours.

    py tools/scenes/remake/statues.py [scene ...] [--no-paint]

(hero: statues_hero.py; packaging: the bronze cat is replaced by a statue of Hermes, hermes.py; the 3D chapter's
drawing stays a drawing; the shop, the landscape and the photography chapter have no people.)
"""
import sys

import numpy as np

from paint import Painter, Tex, before_after, ellipse_mask, feather, grow, hue_window, lab, poly, rect, rgb_of, shrink, solid, uvmask
from statue import CARVE_NEG, CARVE_STYLE, base, carve, desaturate_check, marble, match_light, mean_light

PAINT = '--no-paint' not in sys.argv
_p = None


def painter():
    global _p
    if _p is None and PAINT:
        _p = Painter()
    return _p


def done(t: Tex, stone: np.ndarray, label: str):
    print(f'  {label}: chroma left in the stone {desaturate_check(t, stone):.1f}', flush=True)
    t.save()
    print(' ', before_after(t), flush=True)


def turquoise(t: Tex) -> np.ndarray:
    """the studio's turquoise accents (kept in colour)"""
    return grow(hue_window(t, 160, 195, smin=0.25, soft=8), 2)


# --------------------------------------------------------------------------------------------- the scenes

def solutions():
    """the scholar seated in her study: a marble muse in the dark wood room"""
    from solutions import ROBE
    t = base('solutions', 'Agentic_fg_251209_compressed-optimized_0_Agentic_fg_251207')
    # her head and long hair, traced on the painting (a crop at 650, 180)
    hair = poly(t, [(650 + x, 180 + y) for x, y in [(150, 88), (200, 82), (232, 100), (245, 150), (258, 210), (272, 262),
                                                     (268, 290), (225, 262), (150, 260), (95, 300), (62, 300), (78, 240),
                                                     (100, 180), (118, 128)]])
    figure = feather(np.clip(poly(t, ROBE) + hair, 0, 1), 2)
    marble(t, figure, seed=11, sigma=30)
    p = painter()
    if p:
        carve(p, t, figure, 'a seated young woman in long draped robes, her hands resting on her knee, long straight hair',
              strength=0.55, control=0.6, seed=41, tag='scholar')
    done(t, figure, 'scholar')


def gifts():
    """the woman with the gift card: marble, her turquoise silk turban and the card in colour"""
    from gifts import FACE
    t = base('gifts', 'EW26_Checkout_251209_compressed-optimized_0_Checkout_fg_diffuse_V7')
    keep = np.clip(uvmask(t, 'checkout-hat') + uvmask(t, 'checkout-card.001') + uvmask(t, 'shiny-cardchip'), 0, 1)
    body = np.clip(uvmask(t, 'Checkout.002') + uvmask(t, 'checkout-hand.002'), 0, 1) * solid(t, 0.3) * (1 - grow(keep, 3))
    marble(t, body, seed=13)
    p = painter()
    if p:
        (cx, cy), (ax, ay) = FACE
        head = ellipse_mask(t, (cx + 20, cy + 60), (ax + 230, ay + 260)) * body
        carve(p, t, head, 'portrait of a young woman, long wavy hair, a fine necklace, calm gaze', strength=0.58, seed=43, tag='gifts-head')
        gown = rect(t, (380, 1500, 2048, 2048)) * body
        carve(p, t, gown, 'a woman in a draped gown with an embroidered square neckline, sleeves in deep folds', strength=0.45,
              control=0.65, seed=44, tag='gifts-gown')
        match_light(t, gown, mean_light(t, head))
    done(t, body, 'gifts')


def uniform():
    """the rider on the white horse: an equestrian statue; her cap, her phone and the bridle in turquoise"""
    t = base('uniform', 'EW26_ShopApp_251208v3_compressed-optimized_0_ShopApp_fg_diffuse_V5')
    from uniform import HORSE
    keep = np.clip(uvmask(t, 'Mesh') + uvmask(t, 'Cube.004') + turquoise(t) * poly(t, HORSE), 0, 1)  # cap, phone, bridle
    figure = np.clip(uvmask(t, 'zform_ShopApp_fg_diffuse_Taller') + uvmask(t, 'zform_ShopApp_fg_diffuse_Taller.003')
                     + uvmask(t, 'zform_ShopApp_fg_diffuse_Taller.002') + uvmask(t, 'checkout-hand.001'), 0, 1)
    stone = figure * solid(t, 0.3) * (1 - keep) * (1 - rect(t, (380, 0, 780, 560)))  # the phone's pieces stay
    marble(t, stone, seed=17, sigma=36)
    p = painter()
    if p:
        head = ellipse_mask(t, (990, 600), (250, 285)) * stone
        carve(p, t, head, 'portrait of a young woman with wavy hair falling to her shoulders, calm gaze', strength=0.58, seed=45,
              tag='rider-head')
    done(t, stone, 'rider')


def production():
    """the five round the table: marble busts in their brocades; the chairs, the table and the globe as they were"""
    from production import CHAIR_L, CHAIR_R, FACES
    t = base('production', 'EW26_Operations_251207_compressed-optimized_0_Operations_fg_diffuse_v3')
    table = poly(t, [(770, 1280), (1360, 1280), (1300, 1440), (1330, 1600), (1720, 1600), (2010, 2010), (2048, 2048),
                     (0, 2048), (20, 2000), (770, 1660)])
    chairs = np.clip(poly(t, CHAIR_L) + poly(t, CHAIR_R), 0, 1)
    eyes = sum(uvmask(t, n) for n in ['eyes-m-01', 'eyes-m-02', 'eyes-m-03', 'eyes-w-01', 'eyes-w-02'])
    people = np.clip(solid(t, 0.3) * (1 - table) * (1 - grow(chairs, 2)) + eyes, 0, 1)
    marble(t, people, seed=19, sigma=36)
    p = painter()
    words = {
        'merchant': 'portrait bust of a bearded older man, short curly hair, wise calm eyes',
        'youth': 'portrait bust of a young man in a flat cap, clean shaven, attentive',
        'scholar': 'portrait bust of a man with a moustache and a soft cap, calm',
        'lady': 'portrait bust of a young woman in a winged headdress with a pearl necklace',
        'noblewoman': 'portrait bust of a proud woman with braided hair under a jewelled cap, high cheekbones',
    }
    if p:
        for k, (c, ax) in FACES.items():
            m = ellipse_mask(t, c, (int(ax[0] * 1.5), int(ax[1] * 1.4))) * people
            carve(p, t, m, words[k], strength=0.58, seed=51, tag=f'bust-{k}')
    done(t, people, 'five')


def giveaways():
    """the juggler under the moon: marble in a garden at night, the pins (the studio's) raining round her"""
    t = base('giveaways', 'EW26_Finance_251208v2_compressed-optimized_1_EW26_Finance_251204_WomanDiffuse')
    body = uvmask(t, 'Finance_Woman') * solid(t, 0.3)
    marble(t, body, seed=23, sigma=30)
    done(t, body, 'juggler')


def identity():
    """the painter at the easel: a marble figure; the canvas (the studio's identity) and his brush as they were"""
    t = base('identity', 'EW26_Online_251209v3_compressed-optimized_1_EW26_Online_251204_online_fg_man_BaseColor.1001')
    body = uvmask(t, 'online-man') * solid(t, 0.3)
    marble(t, body, seed=29, sigma=30, flatten=0.0, vein=0.0, drift=0.0)  # a chart-packed atlas
    done(t, body, 'painter')
    h = base('identity', 'EW26_Online_251209v3_compressed-optimized_0_online_fg_diffuse_v5')
    hand = uvmask(h, 'online_hand.001') * solid(h, 0.3)
    marble(h, hand, seed=29, sigma=20)
    match_light(h, hand, mean_light(t, body), amount=0.85)  # in the light of the sleeve it comes out of
    done(h, hand, 'painter hand')


def communication():
    """the creative at the laptop: marble, and unmasked (the reference's sidekick wore a mask; a statue does not):
    the mask's band is filled from the face around it, the eyes carved anew as a statue's, the head carved whole"""
    import cv2
    from communication import BODY, HEAD, MASK
    t = base('communication', 'EW26_Sidekick_251208_compressed-optimized_0_Sidekick_fg_diffuse_clean')
    band = grow(ellipse_mask(t, MASK[0], (MASK[1][0] + 18, MASK[1][1] + 16)) * turquoise(t), 7)  # with its gold rim
    rgb8 = (np.clip(t.rgb, 0, 1) * 255 + 0.5).astype(np.uint8)
    t.rgb = cv2.inpaint(rgb8, (band > 0.3).astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA).astype(np.float32) / 255
    head = ellipse_mask(t, HEAD[0], HEAD[1]) * solid(t, 0.3)
    figure = np.clip(head + rect(t, BODY), 0, 1) * solid(t, 0.3)
    figure *= 1 - rect(t, (0, 0, 420, 700))  # the laptop's pieces
    marble(t, figure, seed=31, sigma=36)
    p = painter()
    if p:
        hx, hy = HEAD[0]
        box = (hx - HEAD[1][0], hy - HEAD[1][1], hx + HEAD[1][0], hy + HEAD[1][1])
        eyes = feather(grow(ellipse_mask(t, MASK[0], (MASK[1][0] + 22, MASK[1][1] + 22)), 6), 6) * head
        p.paint(t, eyes, 'the face of a classical Greek marble statue of a young man, calm blank stone eyes without '
                'pupils, smooth carved eyelids and brows, white marble statue, classical Greek sculpture',
                box=box, style=CARVE_STYLE, negative=CARVE_NEG + ', mask, eye mask, domino mask, blindfold, goggles',
                strength=0.95, control=0.2, seed=51, tag='unmasked-eyes', feather_px=6)
        carve(p, t, head, 'portrait of a young man with short dense curly hair, calm blank eyes',
              strength=0.45, seed=47, tag='unmasked-head')
        body = rect(t, BODY) * figure
        carve(p, t, body, 'a man in a doublet with puffed sleeves and an embroidered collar, his hands on a table',
              strength=0.42, control=0.65, seed=48, tag='masked-body')
        match_light(t, body, mean_light(t, head * figure))
    # the neck in the collar's opening kept a yellow of the old skin: given the carved face's own hue (lightness kept)
    L = lab(t.rgb)
    face = (head * figure) > 0.5
    fa, fb = float(np.median(L[..., 1][face])), float(np.median(L[..., 2][face]))
    yellow = np.clip((L[..., 2] - fb - 3) / 6, 0, 1)
    neck = feather(rect(t, (900, 400, 1280, 620)) * yellow * solid(t, 0.5), 4)
    L[..., 1] = L[..., 1] * (1 - neck) + fa * neck
    L[..., 2] = L[..., 2] * (1 - neck) + fb * neck
    t.rgb = rgb_of(L)
    figure = np.clip(figure + neck, 0, 1)
    done(t, figure, 'creative')


def events():
    """the two in the courtyard: marble figures on the bench, the laptop between them"""
    t = base('events', 'EW26_B2B_251205v2_compressed-optimized_0_EW26_B2B_251203_UVSwapv2_B2B_BaseColor')
    parts = ['tripo_mesh_dc21b46c-e06a-4af7-924d-de0df043a851.002', 'Plane.004', 'Plane.005', 'Plane.007']  # figures, hands
    body = np.clip(sum(uvmask(t, n) for n in parts), 0, 1) * solid(t, 0.3)
    marble(t, body, seed=37, sigma=30)
    done(t, body, 'pair')
    h = base('events', 'EW26_B2B_251205v2_compressed-optimized_1_B2B_Heads')
    a = solid(h, 0.3)
    him = a * rect(h, (0, 0, 500, 512))
    her = a * rect(h, (500, 0, 1024, 512))
    marble(h, np.clip(him + her, 0, 1), seed=37, sigma=24)
    p = painter()
    if p:
        carve(p, h, him, 'profile head of a young man with wavy hair and a short trimmed beard', strength=0.58, seed=49, tag='pair-him')
        carve(p, h, her, 'profile head of a young woman with braided hair crowned with small pearls', strength=0.58, seed=50, tag='pair-her')
        match_light(h, him, mean_light(h, her))
    done(h, np.clip(him + her, 0, 1), 'pair heads')


SCENES = {f.__name__: f for f in [solutions, gifts, uniform, production, giveaways, identity, communication, events]}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or list(SCENES)
    for n in names:
        print(f'# {n}', flush=True)
        SCENES[n]()
