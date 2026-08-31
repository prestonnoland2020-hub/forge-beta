#!/usr/bin/env python3
"""Collapse 303 colour literals onto the semantic tokens in forge-theme.css.

Not a find-and-replace of colours I liked the look of. Every mapping comes from
an audit of where the literal is actually USED — twenty-nine hand-mixed olive
values that are all a border on an accent-flavoured card become --accent-dim;
twenty-four neutral borders become --hairline-strong; seven progress-bar tracks
that are the same bar drawn seven times become --surface-sunken.

WHAT THIS DELIBERATELY DOES NOT TOUCH:

  - the @media print block in readable-plan.css. Print is a third theme with a
    fixed white ground, and its `color:#111!important` is correct there and
    nowhere else.
  - brand colours belonging to somebody else (Strava orange, Google blue).
  - anything inside forge-theme.css itself, which is where the values live now.

Run:  python3 tools/tokenize-css.py [--apply]
Without --apply it reports what it would change and writes nothing.
"""

from __future__ import annotations
import json, os, re, sys

SRC = os.path.join(os.path.dirname(__file__), '..', 'src')

# Files deleted with the old five-package appearance system.
SKIP_FILES = {
    'forge-packages.css', 'appearance-elite.css', 'appearance.css',
    'appearance-system.css', 'profile-customization.css', 'forge-theme.css',
}

# Literals that stay literal, with the reason. Checked before any mapping.
KEEP = {
    '#fc5200': 'Strava brand orange — belongs to Strava, not to our theme',
    '#4285f4': 'Google brand blue',
    '#111': 'inside @media print only',
    '#bbb': 'inside @media print only',
}

# The audited literal -> role map, plus the near-duplicate clusters the audit
# grouped. Roles resolve to the token names in forge-theme.css.
ROLE_TOKEN = {
    'bg': '--bg',
    'surface-1': '--surface-1',
    'surface-2': '--surface-2',
    'surface-3': '--surface-3',
    'surface-sunken': '--surface-sunken',
    'hairline': '--hairline',
    'hairline-strong': '--hairline-strong',
    'ink': '--ink',
    'ink-2': '--ink-2',
    'ink-3': '--ink-3',
    'accent': '--accent',
    'accent-ink': '--accent-ink',
    'accent-dim': '--accent-dim',
    'accent-wash': '--accent-wash',
    'good': '--good',
    'warn': '--warn',
    'bad': '--bad',
    'info': '--info',
    'chart-1': '--chart-1',
    'chart-2': '--chart-2',
    'chart-3': '--chart-3',
    'chart-4': '--chart-4',
    'chart-5': '--chart-5',
    'chart-6': '--chart-6',
    'shadow': None,      # handled separately: shadows are whole declarations
    'overlay': None,
}


def load_map():
    with open('/tmp/colormap.json', encoding='utf-8') as fh:
        rows = json.load(fh)
    mapping = {}
    for row in rows:
        token = ROLE_TOKEN.get(row['role'])
        literal = row['literal'].strip().lower()
        if token and literal.startswith('#') and literal not in KEEP:
            mapping[literal] = token
    return mapping


def print_ranges(text):
    """Character ranges covered by @media print, so we can leave them alone."""
    spans = []
    for match in re.finditer(r'@media\s+print\s*\{', text):
        depth, index = 0, match.end() - 1
        while index < len(text):
            if text[index] == '{': depth += 1
            elif text[index] == '}':
                depth -= 1
                if depth == 0:
                    spans.append((match.start(), index)); break
            index += 1
    return spans


def convert(text, mapping):
    protected = print_ranges(text)
    def guarded(match):
        start = match.start()
        if any(a <= start <= b for a, b in protected):
            return match.group(0)
        literal = match.group(0).lower()
        # Expand #abc to #aabbcc so short and long forms map together.
        if len(literal) == 4:
            literal = '#' + ''.join(c * 2 for c in literal[1:])
        token = mapping.get(literal)
        return f'var({token})' if token else match.group(0)
    return re.sub(r'#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b', guarded, text)


def main():
    apply = '--apply' in sys.argv
    mapping = load_map()
    print(f'{len(mapping)} literals mapped to tokens\n')
    total = 0
    for name in sorted(os.listdir(SRC)):
        if not name.endswith('.css') or name in SKIP_FILES:
            continue
        path = os.path.join(SRC, name)
        with open(path, encoding='utf-8') as fh:
            before = fh.read()
        after = convert(before, mapping)
        changed = sum(1 for a, b in zip(
            re.findall(r'#[0-9a-fA-F]{3,6}\b', before), [None]) if a) if False else \
            len(re.findall(r'#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b', before)) - \
            len(re.findall(r'#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b', after))
        if changed:
            total += changed
            print(f'  {name:38s} {changed:4d} literals -> tokens')
            if apply:
                with open(path, 'w', encoding='utf-8') as fh:
                    fh.write(after)
    print(f'\n{total} literals converted' + ('' if apply else ' (dry run — pass --apply)'))
    left = 0
    for name in sorted(os.listdir(SRC)):
        if name.endswith('.css') and name not in SKIP_FILES:
            with open(os.path.join(SRC, name), encoding='utf-8') as fh:
                left += len(re.findall(r'#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b', fh.read()))
    print(f'{left} hex literals remain (print block, brand colours, unmapped)')


if __name__ == '__main__':
    main()
