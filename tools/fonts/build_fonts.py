"""The web fonts: Latin subsets in WOFF2, and the fallback metrics that keep the page from shifting.

    py tools/fonts/build_fonts.py <folder with the source fonts>

The source fonts are the OFL originals from github.com/google/fonts (ofl/philosopher, ofl/sourcesans3,
ofl/imperialscript): Philosopher-Regular.ttf, Philosopher-Bold.ttf, Philosopher-Italic.ttf, SourceSans3[wght].ttf,
ImperialScript-Regular.ttf (the decorative initials).
Writes public/fonts/*.woff2 and prints the size-adjust / ascent / descent overrides for src/styles/tokens.css.
Needs: fonttools, brotli (pip install fonttools brotli).
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'fonts'
UNICODES = (
    'U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2002-2003,U+2009-200A,U+2010-2015,'
    'U+2018-201E,U+2020-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+2044,U+20AC,U+2116,U+2122,U+2190-2193,'
    'U+2196-2199,U+2212,U+2215,U+2160-216F,U+00D7'
)
SAMPLE = 'Raphael Studios creative hub agency for what comes next 2011'


def subset(src: Path, dst: Path) -> None:
    subprocess.run([sys.executable, '-m', 'fontTools.subset', str(src), f'--unicodes={UNICODES}', "--layout-features=*",
                    '--flavor=woff2', f'--output-file={dst}'], check=True)
    print(f'{dst.name:<32} {dst.stat().st_size / 1024:.1f} KB')


def metrics(path: Path) -> dict:
    t = TTFont(path)
    upm = t['head'].unitsPerEm
    h = t['hhea']
    cmap = t.getBestCmap()
    hm = t['hmtx']
    width = sum(hm[cmap[ord(c)]][0] for c in SAMPLE if ord(c) in cmap) / upm
    return {'asc': h.ascent / upm, 'desc': -h.descent / upm, 'gap': h.lineGap / upm, 'w': width}


def overrides(name: str, font: Path, fallback: Path) -> None:
    f, fb = metrics(font), metrics(fallback)
    sa = f['w'] / fb['w']
    print(f"{name}: size-adjust {sa * 100:.1f}%; ascent-override {f['asc'] / sa * 100:.1f}%; "
          f"descent-override {f['desc'] / sa * 100:.1f}%; line-gap-override {f['gap'] / sa * 100:.1f}%")


def main() -> None:
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    subset(src / 'Philosopher-Regular.ttf', OUT / 'philosopher-400.woff2')
    subset(src / 'Philosopher-Bold.ttf', OUT / 'philosopher-700.woff2')
    subset(src / 'Philosopher-Italic.ttf', OUT / 'philosopher-400-italic.woff2')
    # the script initials and the signature line: basic Latin only
    subprocess.run([sys.executable, '-m', 'fontTools.subset', str(src / 'ImperialScript-Regular.ttf'),
                    '--unicodes=U+0020-007E,U+2019', "--layout-features=*", '--flavor=woff2',
                    f"--output-file={OUT / 'imperial-script-400.woff2'}"], check=True)
    # Source Sans 3: keep the weight axis from 300 to 900 only
    with tempfile.TemporaryDirectory() as tmp:
        limited = Path(tmp) / 'ss3.ttf'
        subprocess.run([sys.executable, '-m', 'fontTools.varLib.instancer', str(src / 'SourceSans3[wght].ttf'), 'wght=300:900',
                        '-o', str(limited), '-q'], check=True)
        subset(limited, OUT / 'source-sans-3-var.woff2')
        windows = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
        georgia, arial = windows / 'georgia.ttf', windows / 'arial.ttf'
        if georgia.exists() and arial.exists():
            overrides('Philosopher 700 over Georgia', src / 'Philosopher-Bold.ttf', georgia)
            overrides('Source Sans 3 over Arial', limited, arial)


if __name__ == '__main__':
    main()
