"""Turns the PNG screenshots from guide-shots.cjs into the small WebP files the Guide bundles.
usage: python3 scripts/guide-shots-pack.py <shots dir> <src/guide dir>"""
import sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
MAXW = 1100

def save(im, name):
    if im.width > MAXW:
        im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
    p = os.path.join(out, name + '.webp')
    im.convert('RGB').save(p, 'WEBP', quality=74, method=6)
    print(f'{name}.webp  {im.width}x{im.height}  {os.path.getsize(p) // 1024} kB')

names = sorted(f[:-4] for f in os.listdir(src) if f.endswith('.png') and not f.startswith('_'))
for n in names:
    if n.startswith('view-'):
        continue
    save(Image.open(os.path.join(src, n + '.png')), n)

# the three views side by side
views = [Image.open(os.path.join(src, f'view-{v}.png')) for v in ('2d', '3d', 'sheets')]
gap = 12
strip = Image.new('RGB', (sum(v.width for v in views) + gap * 2, views[0].height), 'white')
x = 0
for v in views:
    strip.paste(v, (x, 0)); x += v.width + gap
save(strip, 'views')
