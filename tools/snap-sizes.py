#!/usr/bin/env python3
"""Hold every stylesheet to the brand guide's size scales.

    python3 tools/snap-sizes.py           # report anything off-scale, exit 1 if found
    python3 tools/snap-sizes.py --write   # snap it in place

THE IDEA. The guide has one of each scale: five radii, an 8-step 4 pt spacing
grid, a type scale and three control heights. The app had grown about twenty
radii, thirty font sizes and fifteen control heights, one file at a time, and
that variation is the single loudest sign of an unfinished product. This walks
every literal px value in those properties and moves it to the nearest step.

    radius     6 · 10 · 12 (fields) · 14 (controls) · 20 (cards) · 28 (sheets) · pill
    spacing    4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
    type       12 · 14 · 16 · 18 · 20 · 26 · 32 · 40 · 64 · 72
    controls   36 (S) · 48 (M) · 56 (L), on min-height only

What it leaves alone, on purpose: 0-3 px (hairlines, insets, tiny bar ends),
percentages and other units, negative margins, 999px pills, anything inside
@keyframes, and SVG chart text (sized in viewBox units, not CSS px).

Tokens live in src/forge-theme.css. brand.css is the brand layer and is
already on scale, so it is skipped.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'src'
SKIP = {'brand.css', 'forge-grounds.css', 'login-strike.css'}

RADII = [6, 10, 12, 14, 20, 28]
SPACE = [4, 8, 12, 16, 24, 32, 48, 64]
TYPE = [12, 14, 16, 18, 20, 26, 32, 40, 64, 72]
CONTROLS = [36, 48, 56]


def nearest(value, scale):
    return min(scale, key=lambda step: (abs(step - value), -step))


def snap_radius(v):
    if v <= 3 or v >= 100:
        return v
    return nearest(v, RADII) if v < 40 else 28


def snap_space(v):
    if v <= 3:
        return v
    return nearest(v, SPACE) if v <= 80 else v


def snap_type(v):
    return nearest(max(v, 12), TYPE)


def snap_control(v):
    return nearest(v, CONTROLS) if 32 <= v <= 60 else v


PX = re.compile(r'(-?\d+(?:\.\d+)?)px')


def map_px(text, fn):
    def repl(m):
        raw = float(m.group(1))
        if raw < 0:
            return m.group(0)
        out = fn(raw)
        return f'{out:g}px'
    return PX.sub(repl, text)


SPACING_PROPS = r'padding(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap|margin(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?'
DECL = re.compile(
    r'(?P<prop>border-radius|font-size|min-height|font|' + SPACING_PROPS + r')\s*:\s*(?P<val>[^;{}]+)')


def fix_decl(m):
    prop, val = m.group('prop'), m.group('val')
    if 'var(' in val and prop not in ('font',):
        return m.group(0)
    if prop == 'border-radius':
        new = map_px(val, snap_radius)
    elif prop == 'font-size':
        new = map_px(val, snap_type)
    elif prop == 'font':
        # Only the size in the shorthand: "800 22px/1.1 var(--display)".
        new = re.sub(r'(^|\s)(\d+(?:\.\d+)?)px', lambda x: f'{x.group(1)}{snap_type(float(x.group(2))):g}px', val, count=1)
    elif prop == 'min-height':
        new = map_px(val, snap_control)
    else:
        new = map_px(val, snap_space)
    return m.group(0).replace(val, new, 1)


def strip_keyframes(css):
    """Return spans of @keyframes blocks so they can be left untouched."""
    spans = []
    for m in re.finditer(r'@keyframes[^{]*\{', css):
        depth, i = 1, m.end()
        while depth and i < len(css):
            depth += css[i] == '{'
            depth -= css[i] == '}'
            i += 1
        spans.append((m.start(), i))
    return spans


def process(css):
    spans = strip_keyframes(css)
    out, last = [], 0
    for start, end in spans + [(len(css), len(css))]:
        out.append(DECL.sub(fix_decl, css[last:start]))
        out.append(css[start:end])
        last = end
    return ''.join(out)


def main():
    write = '--write' in sys.argv
    changed = []
    for path in sorted(ROOT.glob('*.css')):
        if path.name in SKIP:
            continue
        css = path.read_text()
        new = process(css)
        if new != css:
            changed.append((path, css, new))
            if write:
                path.write_text(new)
    for path, css, new in changed:
        diffs = sum(1 for a, b in zip(DECL.findall(css), DECL.findall(new)) if a != b)
        print(f'{"snapped" if write else "off-scale"}  {path.relative_to(ROOT.parent)}  ({diffs} declarations)')
    if changed and not write:
        print('\nRun with --write to snap these to the brand scale.')
        sys.exit(1)


if __name__ == '__main__':
    main()
