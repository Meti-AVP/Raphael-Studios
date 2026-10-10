"""The painted backdrops behind the scenes, painted anew: Cairo and Egypt seen with Renaissance eyes.

Each backdrop keeps the old one's composition (where the light is, where the masses and the horizon sit, so the
figures in front still stand in the right place) and becomes a new place:

  hero           a garden of old Cairo: date palms and cypresses, bougainvillea, domes and minarets far off
  solutions      through the study's window: a lane of old Cairo, mashrabiya balconies, a minaret
  gifts          the Nile: feluccas, palm groves, the golden hills of the desert
  packaging      Alexandria by moonlight: the harbour, the citadel, a minaret, the sea
  uniform        a dune at dusk under a deep blue sky
  production     a dark turquoise wall, a gilded star pattern in its shadow
  giveaways      a lotus pond at night, blue lotus and moonlight
  identity       a curtain of saffron brocade, and the window on the domes and minarets of Cairo
  communication  the night sky over the pyramids of Giza
  outdoor        a warm sky over the Nile valley
  events         a courtyard of old Cairo: pointed arches in striped stone, lanterns, a marble floor

    py tools/scenes/remake/backdrops.py [scene ...]
"""
import sys

from paint import Painter, Tex, before_after

ART = 'Renaissance oil painting, Raphael and Claude Lorrain, old master landscape, soft atmospheric perspective, warm glazes'
NEG = ('photo, photograph, 3d render, cgi, cartoon, anime, text, letters, watermark, signature, frame, people, person, '
       'figure, animal, modern buildings, cars, blurry, lowres')

BACKDROPS = {
    'hero': ('Hero-bg-hires-optimized.ktx2',
             'a lush garden of old Cairo at golden hour, tall date palms and dark cypresses, flowering bougainvillea and '
             'white jasmine bushes, in the far distance the domes and slender minarets of medieval Cairo, soft clouds in a '
             'pale sky', 0.78, 0.3),
    'solutions': ('Agentic_Bg_windowscene-optimized.ktx2',
                  'a quiet lane of old Cairo seen through a window, carved wooden mashrabiya balconies, a slender stone '
                  'minaret, warm afternoon light, an arched doorway', 0.8, 0.3),
    'gifts': ('Checkout_bg_diffuse-optimized.ktx2',
              'the river Nile in calm morning light, feluccas with white sails on the water, palm groves along the banks, '
              'golden desert hills and cliffs on the far side, a hazy pale sky', 0.75, 0.3),
    'packaging': ('Shipping_bg_diffuse-optimized.ktx2',
                  'Alexandria harbour by moonlight, an old stone citadel on the shore, a slender minaret and a dome, '
                  'the calm Mediterranean sea, a full moon in a deep teal night sky with thin clouds', 0.78, 0.3),
    'uniform': ('ShopApp_bg_diffuse-optimized.ktx2',
                'a towering desert sand dune at dusk in deep shadow, its crest catching the last light, a clear deep blue '
                'sky', 0.75, 0.3),
    'production': ('Operations_bg_diffuse-optimized.ktx2',
                   'a dark turquoise painted wall in deep shadow with a faint gilded Islamic geometric star pattern, '
                   'candle light', 0.7, 0.2),
    'giveaways': ('Finance_bg-optimized.ktx2',
                  'a lotus pond at night, blue Egyptian lotus flowers and round lily pads floating on dark still water, '
                  'moonlight glinting, dark palm silhouettes', 0.75, 0.3),
    'identity': ('Online_bg-brighter_251201v2-optimized_5cdbdf82-dff0-40c9-8c76-111f92afc5ee.ktx2',
                 'a heavy saffron gold brocade curtain with a woven arabesque pattern, drawn aside from a wide window; '
                 'through the window the skyline of old Cairo, many slender minarets and the domes of mosques, the '
                 'Citadel on its hill, under a bright blue sky with small white clouds', 0.92, 0.15),
    'communication': ('EW26_Sidekick_bg_stars-optimized_89d84022-03c9-4267-bb0f-71a26f688511.ktx2',
                      'a deep blue night sky full of stars over the pyramids of Giza on the desert horizon, the milky way, '
                      'soft clouds', 0.75, 0.25),
    'outdoor': ('Marketing_bg_retouched_v3-optimized.ktx2',
                'a warm luminous sky over the Nile valley at late afternoon, soft golden clouds, hazy horizon', 0.7, 0.25),
    'events': ('B2B_Bg_Dark_251202-optimized.ktx2',
               'the courtyard of an old Cairo house at night, arcades of pointed arches in striped red and cream stone, '
               'hanging brass lanterns, potted palms, a polished marble floor with a geometric pattern', 0.78, 0.35),
}


def run(scenes):
    p = Painter()
    for scene in scenes:
        name, prompt, strength, control = BACKDROPS[scene]
        print(f'# {scene}', flush=True)
        t = Tex(scene, name)
        p.repaint(t, prompt, strength=strength, control=control, seed=11, negative=NEG, style=ART, tag=f'bd-{scene}')
        t.save()
        print(' ', before_after(t))


if __name__ == '__main__':
    run(sys.argv[1:] or list(BACKDROPS))
