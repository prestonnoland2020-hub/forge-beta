#!/usr/bin/env python3
"""Derive each accent's seven token values from one brand colour.

    python3 tools/solve-accents.py

Every accent in Forge is one hex from Preston's palettes plus six values solved
for it, not picked by eye. The solver walks OKLab lightness along the accent's
own hue until the value clears its contrast requirement, so the result is the
LIGHTEST version that is still legible — closest to the brand colour that the
job allows, rather than an arbitrary "darker blue".

The requirements, and why each is what it is:

  --a-strong   carries white text          -> measured against #ffffff
  --a-ink      sits on --a-fill in dark    -> measured against the fill
  --a-text     type on a light ground      -> measured against --surface-2,
                                              the DARKEST light surface type
                                              lands on. White is the easy case;
                                              solving for it is how you ship
                                              something that fails on a card.
  --a-text-d   type on a dark ground       -> measured against dark --surface-2,
                                              the lightest dark surface.

Prints a Python dict to paste into the accent blocks of forge-theme.css. The
rendered audit (contrastcheck.mjs) is still the authority — this only makes it
very likely to pass first time.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from oklab import oklch, from_oklch, contrast

# A margin over 4.5 so per-ground hue shifts and 8-bit rounding cannot dip under.
TARGET = 4.75
LIGHT_HARDEST = "#e8ecec"   # --surface-2, light
DARK_HARDEST = "#252e2f"    # --surface-2, dark
WHITE = "#ffffff"

ACCENTS = {
    "signal": "#259de2",   # the brand
    "flare":  "#e2383a",
    "coral":  "#e85949",
    "amber":  "#f6ac01",
    "tide":   "#5ab9ca",
    "harbor": "#627a88",
}


def walk(base, ground, down, chroma=None, floor=TARGET):
    """Nearest value along this hue that clears `floor` against `ground`."""
    L, C, H = oklch(base)
    for step in range(0, 1000):
        d = -step / 1000 if down else step / 1000
        candidate = from_oklch(max(0.02, min(0.99, L + d)),
                               C if chroma is None else chroma, H)
        if contrast(candidate, ground) >= floor:
            return candidate
    return "#000000" if down else "#ffffff"


def solve(base):
    L, C, H = oklch(base)
    fill = base
    strong = walk(base, WHITE, down=True)
    return {
        "fill": fill,
        "fill_d": fill,
        "strong": strong,
        "strong_d": fill,
        "ink": "#ffffff",
        # Near-black of the accent's own hue, chroma capped so it reads as ink
        # rather than as a second, muddier accent.
        "ink_d": walk(base, fill, down=True, chroma=min(C, 0.035)),
        "text": walk(base, LIGHT_HARDEST, down=True),
        "text_d": walk(base, DARK_HARDEST, down=False),
        "dim": from_oklch(min(0.99, L + 0.20), C * 0.55, H),
        "dim_d": from_oklch(max(0.02, L - 0.16), C * 0.80, H),
        "tint": from_oklch(max(0.02, L - 0.08), C, H),
        "tint_d": fill,
    }


def main():
    rows = {name: solve(base) for name, base in ACCENTS.items()}
    for name, v in rows.items():
        v["chart"], v["chart_d"] = v["text"], v["text_d"]

    print(f"{'':8s} {'fill':9s}{'strong':9s}{'ink_d':9s}{'text':9s}{'text_d':9s}{'dim':9s}{'dim_d':9s}{'tint':9s}")
    for name, v in rows.items():
        print(f"{name:8s} " + "".join(f"{v[k]:9s}" for k in
              ("fill", "strong", "ink_d", "text", "text_d", "dim", "dim_d", "tint")))

    print(f"\nverification (floor 4.5, solved to {TARGET}):")
    failures = 0
    for name, v in rows.items():
        checks = [
            ("white/strong", contrast(WHITE, v["strong"])),
            ("ink_d/fill", contrast(v["ink_d"], v["fill"])),
            ("text/#fff", contrast(v["text"], WHITE)),
            ("text/s2", contrast(v["text"], LIGHT_HARDEST)),
            ("text_d/s2", contrast(v["text_d"], DARK_HARDEST)),
        ]
        bad = [k for k, r in checks if r < 4.5]
        failures += len(bad)
        print(f"  {name:8s} " + "  ".join(f"{r:5.2f}" for _, r in checks)
              + ("   FAIL " + ", ".join(bad) if bad else ""))
    print("failures:", failures)

    print("\nACCENT_TEXT for tools/build-grounds.py:")
    print("ACCENT_TEXT = {")
    for name, v in rows.items():
        print(f'    "{name}": ("{v["text"]}", "{v["text_d"]}"),')
    print("}")

    print("\nCSS:")
    for name, v in rows.items():
        print(f'[data-accent="{name}"] {{')
        for role, a, b in [("fill", "fill", "fill_d"), ("strong", "strong", "strong_d"),
                           ("ink", "ink", "ink_d"), ("text", "text", "text_d"),
                           ("dim", "dim", "dim_d"), ("tint", "tint", "tint_d"),
                           ("chart", "chart", "chart_d")]:
            print(f'  --a-{role}: {v[a]};'.ljust(28) + f'--a-{role}-d: {v[b]};')
        print("}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
