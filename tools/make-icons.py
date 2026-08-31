#!/usr/bin/env python3
"""Build every icon Forge ships, from one vector.

The mark is traced once into brand/forge-mark.svg (silhouette) and
brand/forge-logo.svg (faceted). Everything below is composed from those, so a
change to the letterform propagates to the App Store icon, the PWA manifest,
the favicon and every alternate icon in one run. Nothing here is hand-drawn at
a pixel size, which is how icon sets drift apart.

    python3 tools/make-icons.py

Writes public/icons/<accent>/… for each accent, and mirrors the default accent
to the paths index.html and the manifest already reference.
"""
import io
import json
import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
import cairosvg

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
OUT = ROOT / "public"

# Keep in step with the accent blocks in src/forge-theme.css. Only --a-fill
# matters here: the white and grey facets are part of the mark, not the accent.
ACCENTS = {
    "signal": "#259de2",
    "ember":  "#e2622b",
    "volt":   "#d7ff45",
    "sand":   "#cdbaae",
    # The icon ground is #3f4849, so slate uses its LIGHT value here — the
    # mid grey that reads as text on a page disappears on the tile.
    "slate":  "#c3cbca",
}
DEFAULT = "signal"

FACET_WHITE = "#f3f5f5"
FACET_GREY = "#7b807e"

# The ground, from the supplied artwork: charcoal, lit from the upper left.
GROUND_LIT = (86, 95, 95)
GROUND_MID = (63, 72, 73)      # #3f4849
GROUND_DEEP = (46, 54, 55)

SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 384, 512, 1024]
IOS = [20, 29, 40, 58, 60, 76, 80, 87, 100, 114, 120, 152, 167, 180, 1024]


def render(svg_text: str, px: int) -> Image.Image:
    return Image.open(io.BytesIO(cairosvg.svg2png(
        bytestring=svg_text.encode(), output_width=px, output_height=None,
    ))).convert("RGBA")


def ground(px: int) -> Image.Image:
    """Charcoal with a soft diagonal light, matching the source artwork."""
    y, x = np.mgrid[0:px, 0:px].astype(np.float32) / max(px - 1, 1)
    # Distance from the upper-left corner, eased, drives the lit-to-deep ramp.
    d = np.clip(np.sqrt(x ** 2 + y ** 2) / 1.414, 0, 1) ** 0.85
    a = np.empty((px, px, 3), np.float32)
    for i in range(3):
        lit, mid, deep = GROUND_LIT[i], GROUND_MID[i], GROUND_DEEP[i]
        near = lit + (mid - lit) * np.clip(d / 0.5, 0, 1)
        far = mid + (deep - mid) * np.clip((d - 0.5) / 0.5, 0, 1)
        a[:, :, i] = np.where(d < 0.5, near, far)
    return Image.fromarray(a.round().clip(0, 255).astype("uint8")).convert("RGBA")


def long_shadow(alpha: np.ndarray) -> np.ndarray:
    """Smear the silhouette to the lower-right corner.

    Built by doubling: OR the mask with itself shifted 1px diagonally, then
    2px, then 4px… so a full-canvas smear costs log2(n) passes instead of n.
    """
    m = alpha.copy()
    step = 1
    while step < m.shape[0]:
        shifted = np.zeros_like(m)
        shifted[step:, step:] = m[:-step, :-step]
        m = np.maximum(m, shifted)
        step *= 2
    return m


def compose(px: int, fill: str, pad: float = 0.205) -> Image.Image:
    """One square icon: ground, long shadow, then the faceted mark."""
    logo_svg = (BRAND / "forge-logo.svg").read_text().replace("#259de2", fill)
    mark_svg = (BRAND / "forge-mark.svg").read_text().replace("currentColor", "#000")

    inner = max(int(round(px * (1 - 2 * pad))), 1)
    logo = render(logo_svg, inner)
    mark = render(mark_svg, inner)

    # Centre the mark's own box on the canvas.
    ox = (px - logo.width) // 2
    oy = (px - logo.height) // 2

    silhouette = np.zeros((px, px), np.float32)
    m = np.asarray(mark)[:, :, 3].astype(np.float32) / 255
    silhouette[oy:oy + mark.height, ox:ox + mark.width] = m

    canvas = ground(px)
    shade = long_shadow(silhouette)
    # The smear must not darken the mark itself, or the letterform muddies.
    shade = np.clip(shade - silhouette, 0, 1) * 0.26
    veil = Image.fromarray(np.dstack([
        np.zeros((px, px), "uint8"), np.zeros((px, px), "uint8"),
        np.zeros((px, px), "uint8"), (shade * 255).astype("uint8"),
    ]))
    canvas = Image.alpha_composite(canvas, veil)
    canvas.alpha_composite(logo, (ox, oy))
    return canvas


def write(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, "PNG", optimize=True)


def build_accent(name: str, fill: str):
    base = OUT / "icons" / name
    master = compose(1024, fill)
    for s in SIZES:
        write(master.resize((s, s), Image.LANCZOS), base / f"icon-{s}.png")
    # Maskable: Android crops to a circle, so the mark shrinks into the safe zone.
    maskable = compose(1024, fill, pad=0.29)
    for s in (192, 512):
        write(maskable.resize((s, s), Image.LANCZOS), base / f"maskable-{s}.png")
    write(master.resize((180, 180), Image.LANCZOS), base / "apple-touch-icon.png")

    # A vector icon for browsers that prefer one.
    logo = (BRAND / "forge-logo.svg").read_text().replace("#259de2", fill)
    inner = re.sub(r"^<svg[^>]*>|</svg>$", "", logo).strip()
    vb = re.search(r'viewBox="0 0 (\d+) (\d+)"', logo)
    w, h = int(vb.group(1)), int(vb.group(2))
    side = round(max(w, h) / (1 - 2 * 0.205))
    dx, dy = (side - w) / 2, (side - h) / 2
    (base / "icon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">'
        f'<rect width="{side}" height="{side}" fill="#3f4849"/>'
        f'<g transform="translate({dx:.1f},{dy:.1f})">{inner}</g></svg>'
    )
    return base


def main():
    for name, fill in ACCENTS.items():
        base = build_accent(name, fill)
        print(f"  {name:7s} -> {base.relative_to(ROOT)}")

    # index.html and the manifest point at stable paths. The default accent's
    # files are copied there so a first load never waits on JavaScript to pick
    # an icon, and so the favicon is right before React exists.
    src = OUT / "icons" / DEFAULT
    for a, b in [
        ("icon-32.png", OUT / "favicon-32.png"),
        ("icon-16.png", OUT / "favicon-16.png"),
        ("apple-touch-icon.png", OUT / "apple-touch-icon.png"),
        ("icon.svg", OUT / "forge-icon.svg"),
        ("icon-192.png", OUT / "icons/icon-192.png"),
        ("icon-256.png", OUT / "icons/icon-256.png"),
        ("icon-384.png", OUT / "icons/icon-384.png"),
        ("icon-512.png", OUT / "icons/icon-512.png"),
        ("icon-1024.png", OUT / "icons/icon-1024.png"),
        ("maskable-192.png", OUT / "icons/maskable-192.png"),
        ("maskable-512.png", OUT / "icons/maskable-512.png"),
        ("icon-32.png", OUT / "icons/favicon-32.png"),
        ("icon-16.png", OUT / "icons/favicon-16.png"),
        ("icon-48.png", OUT / "icons/favicon-48.png"),
        ("apple-touch-icon.png", OUT / "icons/apple-touch-icon.png"),
    ]:
        b.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src / a, b)

    ico = Image.open(src / "icon-256.png").convert("RGBA")
    ico.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Xcode wants every rasterised size present in the asset catalogue.
    master = Image.open(src / "icon-1024.png").convert("RGBA")
    for s in IOS:
        write(master.resize((s, s), Image.LANCZOS), OUT / "icons/ios" / f"icon-{s}.png")

    manifest = json.loads((OUT / "manifest.webmanifest").read_text())
    manifest["background_color"] = "#131819"
    manifest["theme_color"] = "#131819"
    (OUT / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
    print("  defaults mirrored, favicon.ico and iOS sizes written")


if __name__ == "__main__":
    main()
