#!/usr/bin/env python3
"""Third pass: combine what the second pass proved.

Second pass findings, kept:
  - a gradient between two SATURATED colours (lime → emerald) gives real
    dimension and survives to 40px; a ramp toward a muted tone goes olive.
  - giving the plates a different tone from the bar is what "the shading of the
    arm and tri" actually means — two parts of one object, tonally distinct.
  - the crease has to be soft AND strong enough to see. The first attempt was
    so subtle it may as well not have been there.

These four are variations on one idea rather than five different ideas.
"""

from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

OUT = '/tmp/icon-variants'
SS = 4
TILT = 19

BG_TOP = (12, 17, 15)
BG_BOTTOM = (6, 9, 8)

LIME = (215, 255, 69)
EMERALD = (86, 232, 150)
TEAL = (64, 214, 186)
PLATE_SHADE = 0.82     # plates render at this fraction of the bar's value
FOLD = (18, 40, 14)


def canvas(size):
    y = np.linspace(0, 1, size, dtype=np.float32)[:, None]
    base = np.array(BG_TOP, np.float32) * (1 - y[..., None]) + np.array(BG_BOTTOM, np.float32) * y[..., None]
    base = np.repeat(base, size, axis=1)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dist = np.sqrt((xx - size * 0.5) ** 2 + (yy - size * 0.44) ** 2) / (size * 0.62)
    halo = np.clip(1 - dist, 0, 1) ** 3.4 * 0.06
    return Image.fromarray(np.clip(base + np.array(LIME, np.float32) * halo[..., None], 0, 255).astype(np.uint8), 'RGB')


def ramp_image(size, c0, c1):
    x = np.linspace(0, 1, size, dtype=np.float32)[None, :, None]
    grad = np.array(c0, np.float32) * (1 - x) + np.array(c1, np.float32) * x
    return np.repeat(np.clip(grad, 0, 255), size, axis=0)


BAR = (640, 76, 0, 38)
PLATE_IN = ((88, 330, -206, 28), (88, 330, 206, 28))
PLATE_OUT = ((60, 210, -308, 22), (60, 210, 308, 22))


def bars_mask(size, parts, k):
    u = size / 1024.0
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    c = size / 2
    for w, h, offset, radius in parts:
        draw.rounded_rectangle(
            [c + (offset - w / 2) * u * k, c - h / 2 * u * k,
             c + (offset + w / 2) * u * k, c + h / 2 * u * k],
            radius=radius * u * k, fill=255)
    return mask


def crease(size, k, union, strength):
    """The fold where the bar disappears behind each inner plate.

    A soft band on the bar side of each plate edge, blurred and clipped to the
    silhouette — the same move that separates bicep from forearm in the
    reference, which is depth without a bevel or a highlight."""
    u = size / 1024.0
    band = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(band)
    c = size / 2
    for side in (-1, 1):
        edge = c + side * (206 - 44) * u * k
        draw.rectangle([edge - 26 * u * k, c - 180 * u * k, edge + 26 * u * k, c + 180 * u * k], fill=255)
    band = band.filter(ImageFilter.GaussianBlur(size * 0.007))
    shade = (np.array(band, np.float32) * np.array(union, np.float32) / 255 * strength).astype(np.uint8)
    layer = Image.new('RGBA', (size, size), FOLD + (255,))
    layer.putalpha(Image.fromarray(shade))
    return layer


def build(size, k, *, ramp, plates_darker, crease_strength, shadow):
    bar_mask = bars_mask(size, [BAR], k)
    plate_mask = bars_mask(size, list(PLATE_IN) + list(PLATE_OUT), k)
    union = Image.fromarray(np.maximum(np.array(bar_mask), np.array(plate_mask)))

    grad = ramp_image(size, *ramp)
    mark = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if plates_darker:
        # Same gradient, stepped down in value on the plates: one object, two
        # planes catching different light.
        mark.paste(Image.fromarray((grad * PLATE_SHADE).astype(np.uint8), 'RGB'), (0, 0), plate_mask)
        mark.paste(Image.fromarray(grad.astype(np.uint8), 'RGB'), (0, 0), bar_mask)
    else:
        mark.paste(Image.fromarray(grad.astype(np.uint8), 'RGB'), (0, 0), union)

    if crease_strength:
        mark = Image.alpha_composite(mark, crease(size, k, union, crease_strength))

    mark = mark.rotate(TILT, resample=Image.BICUBIC, center=(size / 2, size / 2))

    out = canvas(size)
    if shadow:
        blur = mark.split()[3].filter(ImageFilter.GaussianBlur(size * 0.028))
        out.paste((0, 0, 0), (int(size * 0.028), int(size * 0.036)), blur.point(lambda v: int(v * 0.6)))
    out.paste(mark, (0, 0), mark)
    return out


VARIANTS = {
    'P-emerald-crease': dict(ramp=(EMERALD, LIME), plates_darker=True, crease_strength=0.6, shadow=False),
    'Q-emerald-clean':  dict(ramp=(EMERALD, LIME), plates_darker=True, crease_strength=0,   shadow=False),
    'R-lime-only':      dict(ramp=((186, 236, 66), LIME), plates_darker=True, crease_strength=0.6, shadow=False),
    'S-teal':           dict(ramp=(TEAL, LIME), plates_darker=True, crease_strength=0.6, shadow=False),
    'T-current':        dict(ramp=(LIME, LIME), plates_darker=False, crease_strength=0,    shadow=False),
}


def render(name, size, k=1.20):
    big = size * SS
    return build(big, k, **VARIANTS[name]).convert('RGB').resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    pad, cell = 26, 300
    sheet = Image.new('RGB', (pad + (cell + pad) * len(VARIANTS), cell + 200 + pad * 3), (26, 27, 29))
    for index, name in enumerate(VARIANTS):
        render(name, 1024).save(f'{OUT}/{name}-1024.png')
        x = pad + index * (cell + pad)
        sheet.paste(render(name, cell), (x, pad))
        y = pad * 2 + cell
        for small in (180, 80, 40):
            sheet.paste(render(name, small), (x, y))
            x += small + 10
        print(f'  {name}')
    sheet.save('/tmp/icon-sheet.png')
    print('\n/tmp/icon-sheet.png')


if __name__ == '__main__':
    main()
