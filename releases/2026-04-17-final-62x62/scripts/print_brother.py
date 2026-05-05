#!/usr/bin/env python3

import json
import sys

from PIL import Image
from brother_ql.backends.helpers import send
from brother_ql.conversion import convert
from brother_ql.raster import BrotherQLRaster

# Pillow 10 removed Image.ANTIALIAS, but brother_ql still references it.
if not hasattr(Image, "ANTIALIAS") and hasattr(Image, "Resampling"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: print_brother.py <config.json>", file=sys.stderr)
        return 2

    with open(sys.argv[1], "r", encoding="utf-8") as fh:
        cfg = json.load(fh)

    image = Image.open(cfg["png_path"]).convert("RGB")
    qlr = BrotherQLRaster(cfg["model"])
    qlr.exception_on_warning = True

    instructions = convert(
        qlr=qlr,
        images=[image],
        label=cfg["label"],
        rotate=cfg.get("rotate", "0"),
        threshold=float(cfg.get("threshold", 70.0)),
        dither=bool(cfg.get("dither", False)),
        compress=bool(cfg.get("compress", False)),
        red=False,
        dpi_600=bool(cfg.get("dpi_600", False)),
        hq=bool(cfg.get("hq", True)),
        cut=bool(cfg.get("cut", True)),
    )

    send(
        instructions=instructions,
        printer_identifier=cfg["printer_identifier"],
        backend_identifier=cfg.get("backend", "network"),
        blocking=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
