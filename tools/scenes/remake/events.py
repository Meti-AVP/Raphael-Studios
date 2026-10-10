"""Events: the meeting in the courtyard, dressed anew: his grey suit in deep turquoise linen, her rose gown in
terracotta silk; their skin and hair as they were. Their heads (B2B_Heads) are painted anew (paint_heads); the
arcade behind them becomes a courtyard of old Cairo (backdrops.py)."""
from paint import (SRC, Clusters, Painter, Tex, before_after, bleed, ellipse_mask, feather, gradient_map, lab, np, rect,
                   shrink, smooth, solid, uvmask)

BODY = 'EW26_B2B_251205v2_compressed-optimized_0_EW26_B2B_251203_UVSwapv2_B2B_BaseColor'
HEADS = 'EW26_B2B_251205v2_compressed-optimized_1_B2B_Heads'
FIGURES = 'tripo_mesh_dc21b46c-e06a-4af7-924d-de0df043a851.002'
TEAL_LINEN = [(0.0, '#030f0e'), (0.3, '#0c3734'), (0.6, '#1a5e57'), (0.85, '#3e857c'), (1.0, '#a3c9c2')]
DARK_HAIR = [(0.0, '#050302'), (0.4, '#160e09'), (0.7, '#2e2017'), (0.9, '#4f3a2b'), (1.0, '#7a604c')]
TERRACOTTA = [(0.0, '#1a0703'), (0.3, '#5c2210'), (0.6, '#a2492a'), (0.82, '#cf7a52'), (0.95, '#efb894'), (1.0, '#fbe3d0')]


def clothes():
    t = Tex('events', BODY)
    inside = uvmask(t, FIGURES)
    core = shrink(inside, 2)
    c = Clusters(t, core, 8)
    c.describe()
    grey = c.pick(lambda l, ch, h: ch < 5 and 22 < l < 60)
    rose = c.pick(lambda l, ch, h: 12 < ch < 20 and 50 <= h < 62 and l > 40)
    skin = c.pick(lambda l, ch, h: (ch >= 20 and h < 66) or (ch > 18 and 66 <= h < 74))
    cream = c.pick(lambda l, ch, h: l > 58 and ch < 16)  # his shirt and trousers
    print('  grey', grey, 'rose', rose, 'skin', skin, 'cream', cream)
    g = c.islands({'grey': grey, 'rose': rose, 'skin': skin, 'cream': cream}, core, majority=0.45)
    gradient_map(t, g['grey'] * core, TEAL_LINEN, keep=0.05, keep_l=0.35)
    keepout = np.clip(g['skin:whole'] + g['cream:whole'], 0, 1)
    gradient_map(t, g['rose'] * core * (1 - keepout), TERRACOTTA, keep=0.1, keep_l=0.45)
    region = np.zeros_like(inside)
    region[inside > 0] = 1
    bleed(t, core + (1 - inside) * (uvmask(t) > 0), None)
    t.save()
    print(' ', before_after(t))
    c.preview(SRC / '_sheets' / 'events-clusters.jpg')


def heads(p: Painter | None):
    """their heads: his suit's collar in the same turquoise as the suit; new faces and hair"""
    t = Tex('events', HEADS)
    L = lab(t.rgb)
    grey = ((np.hypot(L[..., 1], L[..., 2]) < 8) & (L[..., 0] > 18) & (L[..., 0] < 75)).astype(np.float32)
    collar = smooth(grey * rect(t, (0, 330, 470, 512)), t.rgb, r=2)
    gradient_map(t, collar, TEAL_LINEN, keep=0.05, keep_l=0.35)
    if p is not None:
        a = solid(t, 0.3)
        him = a * rect(t, (60, 30, 470, 400))
        p.paint(t, feather(him, 4), 'profile portrait of a young Egyptian man with neat black wavy hair and a short trimmed '
                'beard, olive brown skin, attentive', strength=0.6, control=0.5, seed=41, tag='him')
        her = a * rect(t, (540, 30, 930, 430))
        # her strawberry-blond curls darkened first, so the painting keeps them dark
        L = lab(t.rgb)
        ang = np.degrees(np.arctan2(L[..., 2], L[..., 1]))
        blond = ((np.hypot(L[..., 1], L[..., 2]) > 24) & (ang > 50) & (ang < 85)).astype(np.float32)
        face = feather(ellipse_mask(t, (650, 290), (95, 125)), 8)
        gradient_map(t, smooth(blond * her, t.rgb, r=3) * (1 - face), DARK_HAIR, keep=0.1, keep_l=0.2)
        p.paint(t, feather(her, 4), 'profile portrait of a young woman with dark brown hair braided into a crown with small '
                'pearls, fair olive skin, dark eyes, calm', strength=0.66, control=0.45, seed=42, tag='her')
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    import sys
    clothes()
    heads(None if '--no-paint' in sys.argv else Painter())
