#!/usr/bin/env python3
"""Generate src/forge-grounds.css — the neutral ladder for each ground.

    python3 tools/build-grounds.py

THE IDEA. A "ground" changes what the app is BUILT OUT OF, not how bright it
is. Every ground reuses the same rung lightnesses; only hue and chroma move. So
Midnight's card is exactly as light as Carbon's card, and a colour that clears
4.5:1 on one clears it on all four. Without that constraint every new ground
would need its own accent set, which is the packages problem wearing a hat.

Held constant per rung: OKLab L, taken from the Carbon ladder that shipped.
Varied per ground: hue, and a chroma budget that says how strongly the ground
announces itself.

The script refuses to write if any rung drifts too far in real luminance, or if
any accent or ink falls under its WCAG floor on any ground. Run it after
touching a ground or an accent.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from oklab import oklch, from_oklch, contrast, in_gamut

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "forge-grounds.css"

# The rungs, as they shipped in Carbon. These L values are the contract.
DARK_RUNGS = {
    "bg": "#131819", "surface-1": "#1b2223", "surface-2": "#252e2f",
    "surface-3": "#3f4849", "surface-sunken": "#0d1213",
    "hairline": "#2c3435", "hairline-strong": "#4a5556",
    "ink": "#edf1f1", "ink-2": "#b9c1c0", "ink-3": "#939997",
}
LIGHT_RUNGS = {
    "bg": "#f3f5f5", "surface-1": "#ffffff", "surface-2": "#e8ecec",
    "surface-3": "#dbe1e1", "surface-sunken": "#eaeeee",
    "hairline": "#dce2e2", "hairline-strong": "#bac3c3",
    "ink": "#14181a", "ink-2": "#454c4b", "ink-3": "#5f6563",
}

# hue, chroma budget. Carbon is the default and is emitted for reference only —
# forge-theme.css already declares it on the bare tone blocks.
GROUNDS = {
    "carbon":   dict(hue=205, chroma=0.010, name="Carbon"),
    "midnight": dict(hue=255, chroma=0.042, name="Midnight"),
    "ink":      dict(hue=250, chroma=0.008, name="Ink"),
    "espresso": dict(hue=27,  chroma=0.030, name="Espresso"),
}

# Text rungs carry half the ground's chroma: enough to belong to the surface
# behind them, not enough to read as coloured type.
INK_KEYS = {"ink", "ink-2", "ink-3"}
# Light surfaces take a third: a tint on paper, not coloured paper.
LIGHT_DAMP = 0.34

# --a-text-d / --a-text for every accent, checked against every ground.
ACCENT_TEXT = {
    "signal": ("#006bad", "#29a0e5"),
    "flare":  ("#ca1926", "#ff635d"),
    "coral":  ("#bf3126", "#f96957"),
    "amber":  ("#9a5600", "#f6ac01"),
    "tide":   ("#007181", "#5ab9ca"),
    "harbor": ("#536a78", "#829ba9"),
}
FLOOR = 4.5
# --ink-3 and accent text must clear the floor on these rungs. surface-3 is a
# hover chip and carries --ink, so it is not in the list.
TEXT_ON = ["bg", "surface-1", "surface-2", "surface-sunken"]


def ladder(rungs, ground, light):
    out = {}
    for key, ref in rungs.items():
        L, _, _ = oklch(ref)
        c = ground["chroma"]
        if key in INK_KEYS:
            c *= 0.5
        elif light:
            c *= LIGHT_DAMP
        # A card is white on every ground. There is no room at L=1 for a tint —
        # pushing one in there only bends the colour out of sRGB — and the hue
        # reads better carried by the ground and the controls than by the paper.
        if light and key == "surface-1":
            c = 0.0
        out[key] = from_oklch(L, in_gamut(L, c, ground["hue"]), ground["hue"])
    return out


def check(name, light, values):
    problems = []
    ref = LIGHT_RUNGS if light else DARK_RUNGS
    for key, hexv in values.items():
        drift = abs(contrast(hexv, "#ffffff") - contrast(ref[key], "#ffffff"))
        if drift > 0.35:
            problems.append(f"{name}/{'light' if light else 'dark'} {key}: luminance drift {drift:.2f}")
    for rung in TEXT_ON:
        if contrast(values["ink-3"], values[rung]) < FLOOR:
            problems.append(f"{name} --ink-3 on {rung}: {contrast(values['ink-3'], values[rung]):.2f}")
        for accent, (lt, dk) in ACCENT_TEXT.items():
            text = lt if light else dk
            r = contrast(text, values[rung])
            if r < FLOOR:
                problems.append(f"{name}/{'light' if light else 'dark'} {accent} text on {rung}: {r:.2f}")
    return problems


def block(selector, values, indent="  "):
    close = indent[:-2]
    lines = [f"{selector} {{"]
    for key, hexv in values.items():
        lines.append(f"{indent}--{key}: {hexv};")
    lines.append(close + "}")
    return "\n".join(lines)


def main():
    problems, chunks = [], []
    chunks.append("/* " + __doc__.strip().split("\n\n", 1)[1].replace("*/", "") + " */")

    for name, ground in GROUNDS.items():
        light = ladder(LIGHT_RUNGS, ground, True)
        dark = ladder(DARK_RUNGS, ground, False)
        problems += check(name, True, light) + check(name, False, dark)

        parts = []
        # Carbon is what the bare tone blocks in forge-theme.css already declare,
        # so it needs no :root rules — only the scoped ones below.
        if name != "carbon":
            parts.append(
                block(f':root[data-ground="{name}"],\n[data-ground="{name}"]', light)
                + "\n\n@media (prefers-color-scheme: dark) {\n"
                + block(f'  :root[data-ground="{name}"]:not([data-theme="light"]),\n'
                        f'  :root:not([data-theme="light"]) [data-ground="{name}"]:not([data-force-tone])', dark, "    ")
                + "\n}\n\n"
                + block(f':root[data-ground="{name}"][data-theme="dark"],\n'
                        f':root[data-theme="dark"] [data-ground="{name}"]:not([data-force-tone])', dark)
            )

        # FORCED TONE. The settings screen has to show light and dark side by
        # side while the page itself is in one of them, so it needs the other
        # ladder on an element rather than on :root. Custom properties inherit,
        # so declaring them on the element is enough to win the inheritance —
        # but NOT enough to win the cascade against the scoped rules above,
        # which match the very same element at higher specificity and would
        # paint every swatch in the page's own tone. Hence the
        # :not([data-force-tone]) guard on those.
        sel_l = f'[data-force-tone="light"][data-ground="{name}"]'
        sel_d = f'[data-force-tone="dark"][data-ground="{name}"]'
        if name == "carbon":
            sel_l = '[data-force-tone="light"],\n' + sel_l
            sel_d = '[data-force-tone="dark"],\n' + sel_d
        parts.append(block(sel_l, light))
        parts.append(block(sel_d, dark))

        chunks.append(f"/* {ground['name']} — hue {ground['hue']}, chroma {ground['chroma']}. */\n"
                      + "\n\n".join(parts))

    if problems:
        print("REFUSING TO WRITE:")
        for p in problems:
            print("  " + p)
        return 1

    header = ("/* GENERATED by tools/build-grounds.py — do not edit by hand.\n"
              "   Rung lightnesses come from the Carbon ladder in forge-theme.css;\n"
              "   only hue and chroma move. Re-run the tool after changing either. */\n\n")
    OUT.write_text(header + "\n\n".join(chunks) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} — {len(GROUNDS)} grounds, all rungs and accents clear {FLOOR}:1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
