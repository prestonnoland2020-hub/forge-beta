#!/usr/bin/env python3
"""Generate the complete Forge icon set from one geometric definition.

THE MARK. Forge logs the top set — the one heaviest honest effort of a session
— so the mark is a loaded barbell seen straight on, sitting on the line the
app already uses as its wordmark glyph. The bar is the accent; the plates are
solid blocks with no gradient, no bevel and no perspective, because an icon is
read at 40 pixels on a home screen far more often than at 1024 in a store
listing.

Everything is drawn at 4x and downsampled with LANCZOS, which is what keeps
the plate edges clean at small sizes instead of stair-stepping.

Apple rules this obeys: the App Store icon is fully opaque, square, has no
rounded corners of its own (the system masks it), and no alpha channel at all
— an icon with alpha is rejected at upload.
"""

from __future__ import annotations
import os
from PIL import Image, ImageDraw
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
S = 1024          # design canvas
SS = 4            # supersample factor

BG_TOP = (12, 17, 15)
BG_BOTTOM = (6, 9, 8)
ACCENT = (215, 255, 69)
GLOW = (215, 255, 69)


def canvas(size: int) -> Image.Image:
    """Dark vertical gradient with a soft accent glow behind the bar."""
    y = np.linspace(0, 1, size, dtype=np.float32)[:, None]
    top = np.array(BG_TOP, dtype=np.float32)
    bottom = np.array(BG_BOTTOM, dtype=np.float32)
    base = top * (1 - y[..., None]) + bottom * y[..., None]
    base = np.repeat(base, size, axis=1)

    # Radial glow, centred slightly above the middle so the composition sits up.
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cx, cy = size * 0.5, size * 0.44
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (size * 0.62)
    # Tight and faint. A broad halo turned the background muddy grey-green at
    # small sizes instead of reading as black.
    halo = np.clip(1 - dist, 0, 1) ** 3.4 * 0.065
    base = base + np.array(GLOW, dtype=np.float32) * halo[..., None]

    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), 'RGB')


TILT = 19  # degrees, right end lifted


def barbell(image: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    """A LOADED BAR ON THE WAY UP.

    Two attempts preceded this one. A level dumbbell was indistinguishable
    from every other icon in the category — it said 'fitness app' and stopped
    there. Three stacked pills said 'top set' honestly but read, at any size,
    as a loading skeleton.

    So: the bar itself, loaded, tilted so the right end rises. It is a barbell
    and it is an upward stroke at the same time, which is the whole product —
    log the heaviest honest set, watch the line move. The diagonal is what
    stops it being stock art, and at 29 pixels it survives as a bold rising
    slash with weight on the ends.

    Drawn flat on its own layer and rotated afterwards, because rotating
    finished geometry at 4x supersample keeps the plate corners clean; drawing
    on the diagonal directly would alias them.
    """
    u = size / 1024.0
    k = scale * 1.15
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    cx = cy = size / 2

    def bar(w, h, offset, radius):
        draw.rounded_rectangle(
            [cx + (offset - w / 2) * u * k, cy - h / 2 * u * k,
             cx + (offset + w / 2) * u * k, cy + h / 2 * u * k],
            radius=radius * u * k, fill=ACCENT + (255,),
        )

    bar(660, 68, 0, 34)                       # the bar
    for side in (-1, 1):
        bar(78, 310, side * 214, 22)          # inner plates — the heavy pair
    for side in (-1, 1):
        bar(54, 196, side * 310, 16)          # outer plates

    layer = layer.rotate(TILT, resample=Image.BICUBIC, center=(cx, cy))
    image.paste(layer, (0, 0), layer)
    return image


def render(size: int, mark_scale: float = 1.0) -> Image.Image:
    big = size * SS
    image = barbell(canvas(big), big, mark_scale)
    return image.convert('RGB').resize((size, size), Image.LANCZOS)


def save(image: Image.Image, name: str) -> None:
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, 'PNG', optimize=True)
    print(f'  {name}  {image.size[0]}×{image.size[1]}')


def svg(background: bool) -> str:
    """The same geometry as vectors, from the same constants, so the favicon
    and the in-app mark can never drift away from the store icon."""
    k = 1.15
    accent = '#%02x%02x%02x' % ACCENT
    parts = []
    for w, h, offset, radius in ((660, 68, 0, 34), (78, 310, -214, 22), (78, 310, 214, 22),
                                 (54, 196, -310, 16), (54, 196, 310, 16)):
        w, h, offset, radius = w * k, h * k, offset * k, radius * k
        parts.append(
            f'<rect x="{512 + offset - w / 2:.1f}" y="{512 - h / 2:.1f}" '
            f'width="{w:.1f}" height="{h:.1f}" rx="{radius:.1f}" fill="{accent}"/>'
        )
    shapes = '\n    '.join(parts)
    # SVG rotates clockwise in screen coordinates, so the right end lifts at
    # NEGATIVE degrees — the mirror of PIL's convention above.
    ground = '<rect width="1024" height="1024" fill="#0b100e"/>\n  ' if background else ''
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
        'role="img" aria-label="Forge">\n  '
        f'{ground}<g transform="rotate({-TILT} 512 512)">\n    {shapes}\n  </g>\n</svg>\n'
    )


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    print('App Store / Play Store')
    # No alpha, no rounded corners: Apple masks the shape and rejects alpha.
    save(render(1024), 'icon-1024.png')
    save(render(512), 'icon-512.png')

    print('iOS app icon set')
    for size in (180, 167, 152, 144, 120, 114, 100, 87, 80, 76, 60, 58, 40, 29, 20):
        save(render(size), f'ios/icon-{size}.png')

    print('Android / PWA')
    for size in (192, 256, 384, 512):
        save(render(size), f'icon-{size}.png')
    # Maskable: Android crops to a circle inscribed in the safe zone, so the
    # mark shrinks to ~62% and the background carries the rest.
    for size in (192, 512):
        save(render(size, mark_scale=0.62), f'maskable-{size}.png')

    print('Web')
    save(render(180), 'apple-touch-icon.png')
    for size in (16, 32, 48):
        save(render(size, mark_scale=1.12), f'favicon-{size}.png')

    # Multi-resolution .ico for legacy browser chrome.
    ico = render(48, mark_scale=1.12)
    ico.save(os.path.join(OUT, '..', 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])
    print('  favicon.ico')

    print('Vectors')
    public = os.path.join(OUT, '..')
    for name, has_bg in (('forge-icon.svg', True), ('forge-mark.svg', False)):
        with open(os.path.join(public, name), 'w', encoding='utf-8') as handle:
            handle.write(svg(has_bg))
        print(f'  {name}')

    # The names the app and manifest already reference, so nothing downstream
    # has to change to pick up the new mark.
    print('Replacing the previous set in place')
    aliases = {
        'forge-icon-192.png': render(192),
        'forge-icon-512.png': render(512),
        'forge-icon-maskable-512.png': render(512, mark_scale=0.62),
        'apple-touch-icon.png': render(180),
        'favicon-16.png': render(16, mark_scale=1.12),
        'favicon-32.png': render(32, mark_scale=1.12),
    }
    for name, image in aliases.items():
        image.save(os.path.join(public, name), 'PNG', optimize=True)
        print(f'  {name}')

    print('\nDone. Every icon is opaque RGB with no alpha channel.')


if __name__ == '__main__':
    main()
