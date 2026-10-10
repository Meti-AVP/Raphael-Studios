"""Identity: the painter at the easel, in deep turquoise velvet instead of red; the white shirt and the hair as
they were. The easel's canvas already shows Raphael's identity (rebrand.py); the curtain and the sky behind become
a window on old Cairo (backdrops.py)."""
from paint import Clusters, SRC, Tex, before_after, bleed, gradient_map, np, shrink, uvmask

MAN = 'EW26_Online_251209v3_compressed-optimized_1_EW26_Online_251204_online_fg_man_BaseColor.1001'
TEAL_VELVET = [(0.0, '#020a09'), (0.3, '#06302c'), (0.6, '#0f5a53'), (0.85, '#2f8b81'), (1.0, '#93d0c6')]


def velvet():
    t = Tex('identity', MAN)
    inside = uvmask(t)
    core = shrink(inside, 2)
    c = Clusters(t, core, 6)
    c.describe()
    red = c.pick(lambda l, ch, h: ch > 13 and h < 50)
    skin = c.pick(lambda l, ch, h: ch > 16 and 60 <= h < 76)
    cream = c.pick(lambda l, ch, h: l > 58 and ch < 16)
    shade = c.pick(lambda l, ch, h: 8 < ch and h < 60 and 12 < l < 24)  # the velvet's deep folds
    print('  red', red, 'shade', shade, 'skin', skin, 'cream', cream)
    g = c.islands({'red': red, 'shade': shade, 'skin': skin, 'cream': cream}, core, majority=0.4)
    keepout = np.clip(g['skin:whole'] + g['cream:whole'], 0, 1)
    velvet_isl = g['red:whole']  # the deep folds only where the island is velvet (the nape is as dark)
    m = np.clip(g['red'] + g['shade'] * velvet_isl, 0, 1)
    gradient_map(t, m * core * (1 - keepout), TEAL_VELVET, keep=0.04, keep_l=0.35, lo=1, hi=99)
    bleed(t, core)
    t.save()
    print(' ', before_after(t))
    c.preview(SRC / '_sheets' / 'identity-clusters.jpg')


if __name__ == '__main__':
    velvet()
