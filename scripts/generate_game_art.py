#!/usr/bin/env python3
"""Convert SVG placeholders in `assets/games/` to 1024×1024 PNGs using CairoSVG.

Usage: python3 scripts/generate_game_art.py
"""
import sys
from pathlib import Path

try:
    from cairosvg import svg2png
except Exception:
    print('Missing dependency: cairosvg. Install with `pip install cairosvg`', file=sys.stderr)
    raise


def main():
    base = Path('assets/games')
    if not base.exists():
        print('Directory not found:', base, file=sys.stderr)
        return 1

    svgs = list(base.glob('*.svg'))
    if not svgs:
        print('No SVG files found in', base)
        return 0

    for svg in svgs:
        out = svg.with_suffix('.png')
        try:
            svg2png(url=str(svg), write_to=str(out), output_width=1024, output_height=1024)
            print(f'Converted: {svg.name} -> {out.name}')
        except Exception as e:
            print(f'Failed to convert {svg.name}: {e}', file=sys.stderr)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
