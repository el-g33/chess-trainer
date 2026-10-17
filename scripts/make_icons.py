"""
make_icons.py
-------------
Draws the app icon (a cream Merida knight on walnut, like the board) and
saves the sizes an installable web app needs into public/icons/:

  icon.svg           - for browsers that take an SVG icon (and the tab icon)
  icon-192.png       - home screen icon
  icon-512.png       - splash screen / large icon
  maskable-512.png   - Android's adaptive icon (the knight inside the safe zone)
  apple-touch-icon.png (180) - iPhone / iPad home screen

Needs Python with Tk 9 (it draws SVG), e.g. the desktop app's Python:
    python scripts/make_icons.py
"""

import re
import tkinter as tk
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"

CREAM = "#F3E6C8"
CREAM_SHADOW = "#2A221B"
WALNUT = "#8A5B3A"
WALNUT_DARK = "#6E4529"
WOOD_LIGHT = "#D9BC92"


def knight_paths() -> str:
    """The white Merida knight's drawing (recoloured cream like the board pieces)."""
    svg = (ROOT / "public" / "pieces" / "wN.svg").read_text(encoding="utf-8")
    svg = svg.replace('fill="#1f1a17"', f'fill="{CREAM_SHADOW}"')
    svg = svg.replace('stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"',
                      f'stop-color="{CREAM}"/><stop offset="1" stop-color="#C9B48E"')
    start = svg.index(">", svg.index("<svg")) + 1
    return svg[start:svg.rindex("</svg>")]


def icon_svg(size: int, maskable: bool) -> str:
    """The icon at `size` pixels. A maskable icon fills the square (the phone
    cuts its own shape) and keeps the knight well inside the middle."""
    knight_share = 0.58 if maskable else 0.74
    k = size * knight_share / 50          # the knight is drawn on a 50 x 50 grid
    offset = (size - 50 * k) / 2
    radius = 0 if maskable else size * 0.2
    inset = size * 0.06
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
        f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{WALNUT}"/><stop offset="1" stop-color="{WALNUT_DARK}"/></linearGradient></defs>'
        f'<rect width="{size}" height="{size}" rx="{radius:.1f}" fill="url(#bg)"/>'
        # a thin light-wood frame, like the edge of a board
        + ("" if maskable else
           f'<rect x="{inset:.1f}" y="{inset:.1f}" width="{size - 2 * inset:.1f}" height="{size - 2 * inset:.1f}" '
           f'rx="{radius * 0.7:.1f}" fill="none" stroke="{WOOD_LIGHT}" stroke-opacity="0.55" stroke-width="{size * 0.018:.1f}"/>')
        + f'<g transform="translate({offset:.2f} {offset + size * 0.01:.2f}) scale({k:.4f})">{knight_paths()}</g>'
        '</svg>'
    )


def save_png(svg: str, path: Path, root: tk.Tk):
    image = tk.PhotoImage(master=root, data=svg, format="svg")
    image.write(str(path), format="png")
    print(f"{path.name}: {image.width()} x {image.height()}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icon.svg").write_text(re.sub(r'width="512" height="512" ', "", icon_svg(512, False)), encoding="utf-8")
    root = tk.Tk()
    root.withdraw()
    for size in (192, 512):
        save_png(icon_svg(size, False), OUT / f"icon-{size}.png", root)
    save_png(icon_svg(512, True), OUT / "maskable-512.png", root)
    save_png(icon_svg(180, True), OUT / "apple-touch-icon.png", root)   # iOS rounds the corners itself
    root.destroy()


if __name__ == "__main__":
    main()
