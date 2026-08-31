"""sRGB <-> OKLab/OKLCh, plus WCAG contrast. No dependencies.

OKLab because the whole ground system rests on one claim: that two colours
with the same L are equally light. In HSL that claim is false — hsl(220 30% 20%)
and hsl(30 30% 20%) differ by a third of a stop in real luminance — so ladders
built in HSL drift and every ground needs its own contrast audit. In OKLab the
claim holds well enough that a rung is a rung.
"""
import math

def _f(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def _g(c):
    c = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return max(0, min(255, round(c * 255)))

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def rgb_hex(rgb):
    return '#%02x%02x%02x' % tuple(rgb)

def srgb_oklab(h):
    r, g, b = (_f(c) for c in hex_rgb(h))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)

def oklab_srgb(L, a, b):
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return rgb_hex((
        _g(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        _g(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        _g(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
    ))

def oklch(h):
    L, a, b = srgb_oklab(h)
    return L, math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360

def from_oklch(L, C, H):
    r = math.radians(H)
    return oklab_srgb(L, C * math.cos(r), C * math.sin(r))

def luminance(h):
    r, g, b = hex_rgb(h)
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def contrast(a, b):
    x, y = luminance(a), luminance(b)
    hi, lo = max(x, y), min(x, y)
    return (hi + 0.05) / (lo + 0.05)


def in_gamut(L, C, H):
    """Largest chroma <= C whose sRGB round-trip keeps this L.

    from_oklch happily returns a colour outside sRGB, and the clamp inside _g
    then silently moves it — a near-white blue comes back as #f9ffff, cyan and
    a full step off the rung. Binary-searching chroma down until the round-trip
    lands keeps every ground on the ladder it was built for.
    """
    lo, hi = 0.0, C
    for _ in range(24):
        mid = (lo + hi) / 2
        if abs(oklch(from_oklch(L, mid, H))[0] - L) < 0.002:
            lo = mid
        else:
            hi = mid
    return lo
