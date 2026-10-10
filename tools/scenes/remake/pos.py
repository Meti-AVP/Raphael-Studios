"""POS materials: the shop under the dome, made the studio's.

  * the shelves painted in the arcade: the studio's products (folded tees, caps, tote bags, gift boxes) instead of a
    skate shop's decks (the decks on the wall in front are already Raphael's: rebrand.py);
  * the view through the arches: the Nile valley, palms and the pyramids far off;
  * the floor's round inlay: a Mamluk star of red, cream and black marble;
  * the dome's oculus: a gold star rosette on lapis instead of doves in the sky.
"""
import cv2
from PIL import Image, ImageDraw

from paint import Painter, Tex, before_after, feather, np, rect

ROOM = 'POS_V53_environment_251209v2_compressed-optimized_0_RetouchedPOSBackground_Merged_V3.psd'
DOME = 'POS_V53_environment_251209v2_compressed-optimized_1_FullDomeTexture'
ART = 'Italian Renaissance oil painting, trompe l oeil, warm candle light, old master, fine detail'


def remake(p: Painter):
    t = Tex('pos', ROOM)
    for i, box in enumerate([(20, 330, 392, 690), (1636, 390, 1984, 712)]):
        p.paint(t, feather(rect(t, box), 4), 'wooden shop shelves stacked with neatly folded t-shirts, caps, canvas tote '
                'bags and small gift boxes in turquoise, ivory and burgundy', strength=0.78, control=0.45, seed=71 + i,
                style=ART, tag=f'shelves-{i}')
    # the view outside the arches (the panorama lies on its side in the texture)
    p.paint(t, feather(rect(t, (1030, 925, 1735, 2048)), 4), 'the Nile valley seen from a terrace, date palms and fields '
            'along the river, the pyramids of Giza far off in a pale haze, a soft blue sky with small clouds', strength=0.8,
            control=0.3, seed=73, rot=1, style=ART, tag='view')
    p.paint(t, feather(rect(t, (20, 940, 1010, 1930)), 4), 'a round inlaid marble floor medallion of the Mamluk era, an '
            'eight pointed star and interlacing geometric bands in red, cream and black marble', strength=0.75,
            control=0.45, seed=74, style=ART, tag='floor')
    t.save()
    print(' ', before_after(t))
    oculus()


def oculus():
    """the dome's oculus, drawn: a gold eight-pointed star (two squares) and its rosette of sixteen petals on lapis,
    fine gold rings, a painted grain and the dome's shade at its rim (no doves, no sky)"""
    d = Tex('pos', DOME)
    cx, cy, R = 1024, 1024, 420  # the oculus, inside its moulded ring
    s = 3
    S = int(2 * R * s)
    im = Image.new('RGB', (S, S), (16, 34, 92))
    dr = ImageDraw.Draw(im)
    c = S / 2
    gold, deep = (214, 172, 84), (150, 112, 46)

    def star(r, rot):
        return [(c + r * np.cos(rot + k * np.pi / 2), c + r * np.sin(rot + k * np.pi / 2)) for k in range(4)]
    for k in range(16):  # the petals
        a = k * np.pi / 8
        tip = (c + 0.92 * c * np.cos(a), c + 0.92 * c * np.sin(a))
        l = (c + 0.6 * c * np.cos(a - 0.17), c + 0.6 * c * np.sin(a - 0.17))
        r_ = (c + 0.6 * c * np.cos(a + 0.17), c + 0.6 * c * np.sin(a + 0.17))
        dr.polygon([l, tip, r_, (c + 0.52 * c * np.cos(a), c + 0.52 * c * np.sin(a))], fill=deep if k % 2 else gold)
    for rot in (0, np.pi / 4):  # the eight-pointed star
        dr.polygon(star(0.5 * c, rot), fill=gold)
    dr.ellipse((c - 0.2 * c, c - 0.2 * c, c + 0.2 * c, c + 0.2 * c), fill=(18, 158, 146))  # a turquoise heart
    dr.ellipse((c - 0.12 * c, c - 0.12 * c, c + 0.12 * c, c + 0.12 * c), fill=gold)
    for rr, w in ((0.97, 6), (0.55, 3), (0.24, 3)):
        dr.ellipse((c - rr * c, c - rr * c, c + rr * c, c + rr * c), outline=gold, width=w * s)
    art = np.asarray(im.resize((2 * R, 2 * R), Image.LANCZOS)).astype(np.float32) / 255
    rng = np.random.default_rng(9)
    grain = cv2.GaussianBlur(rng.normal(0, 0.05, art.shape[:2]).astype(np.float32), (0, 0), 1.2)[..., None]
    yy, xx = np.mgrid[0:2 * R, 0:2 * R]
    rad = np.hypot(xx - R, yy - R) / R
    shade = np.clip(1.08 - 0.45 * rad ** 3, 0.55, 1.08)[..., None]  # the rim falls into the dome's shadow
    art = np.clip(art * (1 + grain) * shade, 0, 1)
    m = np.clip((1.0 - rad) * R / 6, 0, 1)[..., None]  # a soft edge against the moulding
    y0, x0 = cy - R, cx - R
    d.rgb[y0:y0 + 2 * R, x0:x0 + 2 * R] = d.rgb[y0:y0 + 2 * R, x0:x0 + 2 * R] * (1 - m) + art * m
    d.save()
    print(' ', before_after(d))


if __name__ == '__main__':
    remake(Painter())
