"""Outdoor: the billboard on the hill, in a landscape of Egypt instead of Italy.

  * the umbrella pine painted anew (the cypresses and the olive trees stay: they grow in Egypt's gardens too);
  * the far mountains -> the desert plateau of Giza, its pyramids in the haze;
  * the lake and its town -> the Nile, its feluccas, palm groves and a village with a minaret;
  * the sky behind: backdrops.py; the billboard: Raphael's poster (rebrand.py).
"""
from paint import Painter, Tex, before_after, feather, grow, np, rect, solid

FG = 'EW26_Marketing_251209v4_compressed-optimized_0_NewMarketing_fg'
LAND = ('Italian Renaissance landscape painting, Claude Lorrain and Raphael, soft atmospheric perspective, warm '
        'evening light, old master oil painting')


def remake(p: Painter):
    t = Tex('outdoor', FG)
    a = solid(t, 0.3)
    pine = a * rect(t, (180, 40, 790, 905))
    # (a stronger repaint made it a date palm of sorts, and the cypresses beside it pale plumes: this one keeps the
    # umbrella pine's form, which grows in Alexandria's gardens too, painted anew)
    p.paint(t, feather(grow(pine, 2), 3), 'a tall date palm tree with a slender ringed trunk and a crown of long arching '
            'green fronds against the sky', strength=0.85, control=0.3, seed=61, style=LAND, tag='palm')
    hills = a * rect(t, (60, 1410, 1800, 1630))
    p.paint(t, feather(hills, 3), 'the pyramids of Giza standing on a golden desert plateau in the hazy distance, soft '
            'blue shadows', strength=0.8, control=0.25, seed=62, style=LAND, tag='pyramids')
    river = a * rect(t, (0, 1650, 2048, 2030))
    p.paint(t, feather(river, 3), 'the river Nile in calm evening light, white-sailed feluccas on the water, palm groves on '
            'the banks, a village of mud-brick houses with a slender minaret, golden fields', strength=0.75, control=0.3,
            seed=63, style=LAND, tag='nile')
    t.save()
    print(' ', before_after(t))


if __name__ == '__main__':
    remake(Painter())
