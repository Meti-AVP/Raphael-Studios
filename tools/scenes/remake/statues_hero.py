"""Hero (v4): the two flying figures in white marble; her tumbler and his bag (the studio's) in colour."""
import sys

from paint import Painter, before_after, np, rect, solid
from statue import base, carve, desaturate_check, marble, match_light, mean_light

PACKED = 'EW26_Hero_251207v3_compressed-optimized_0_Hero_Packed_Texture.psd'
HEADS = 'EW26_Hero_251207v3_compressed-optimized_1_Hero_fg_Heads'


def bodies():
    t = base('hero', PACKED)
    stone = np.clip(rect(t, (0, 0, 2048, 1024)) + rect(t, (1536, 1024, 2048, 2048)), 0, 1)  # robes, skin (hands, feet)
    marble(t, stone, seed=5)
    print('  chroma left in the stone', round(desaturate_check(t, stone), 1))
    t.save()
    print(' ', before_after(t))


def heads(p: Painter | None):
    t = base('hero', HEADS)
    a = solid(t, 0.3)
    her = a * rect(t, (0, 0, 560, 512))
    him = a * rect(t, (540, 0, 1024, 512))
    marble(t, np.clip(her + him, 0, 1), keep_l=0.55, seed=9)  # first by colour, so the carving starts from stone
    if p is not None:
        carve(p, t, her, 'profile head of a young woman with long flowing curls blown by the wind', strength=0.55, seed=31, tag='her')
        carve(p, t, him, 'head of a young man with short tight curls, calm serene face, gentle expression', strength=0.62, seed=33, rot=2, tag='him')
    # one stone: his head as light as hers (his was painted darker), both as light as the bodies' stone
    match_light(t, him, mean_light(t, her))
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    bodies()
    heads(None if '--no-paint' in sys.argv else Painter())
