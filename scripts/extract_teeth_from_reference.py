"""Extrae sprites de dientes desde docs/Odontograma.jpg (referencia clínica)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "Odontograma.jpg"
OUT = ROOT / "frontend" / "public" / "dientes" / "referencia"

# Coordenadas calibradas sobre imagen 1163×912 (arcada permanente adulta).
UPPER_TEETH: dict[str, tuple[int, int, int, int]] = {
    "18": (70, 418, 46, 112),
    "17": (116, 418, 46, 112),
    "16": (162, 418, 46, 112),
    "15": (208, 418, 46, 112),
    "14": (254, 418, 46, 112),
    "13": (300, 418, 46, 112),
    "12": (346, 418, 46, 112),
    "11": (392, 418, 46, 112),
    "21": (492, 418, 46, 112),
    "22": (538, 418, 46, 112),
    "23": (584, 418, 46, 112),
    "24": (630, 418, 46, 112),
    "25": (676, 418, 46, 112),
    "26": (722, 418, 46, 112),
    "27": (768, 418, 46, 112),
    "28": (814, 418, 46, 112),
}

LOWER_TEETH: dict[str, tuple[int, int, int, int]] = {
    "48": (70, 688, 46, 112),
    "47": (116, 688, 46, 112),
    "46": (162, 688, 46, 112),
    "45": (208, 688, 46, 112),
    "44": (254, 688, 46, 112),
    "43": (300, 688, 46, 112),
    "42": (346, 688, 46, 112),
    "41": (392, 688, 46, 112),
    "31": (492, 688, 46, 112),
    "32": (538, 688, 46, 112),
    "33": (584, 688, 46, 112),
    "34": (630, 688, 46, 112),
    "35": (676, 688, 46, 112),
    "36": (722, 688, 46, 112),
    "37": (768, 688, 46, 112),
    "38": (814, 688, 46, 112),
}

# Plantillas por tipo anatómico (referencia Odontograma.jpg)
TYPE_SOURCE: dict[str, str] = {
    "incisor": "42",
    "canine": "43",
    "premolar": "44",
    "molar_upper": "16",
    "molar_lower": "46",
}


def crop(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = box
    return im.crop((x, y, x + w, y + h)).convert("RGBA")


def white_to_alpha(img: Image.Image, threshold: int = 248) -> Image.Image:
    data = img.getdata()
    out = []
    for r, g, b, a in data:
        if r >= threshold and g >= threshold and b >= threshold:
            out.append((255, 255, 255, 0))
        else:
            out.append((r, g, b, 255))
    img.putdata(out)
    return img


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing reference: {SRC}")

    im = Image.open(SRC).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)

    # Por pieza FDI (vestibular)
    for pieza, box in {**UPPER_TEETH, **LOWER_TEETH}.items():
        tile = crop(im, box)
        tile = white_to_alpha(tile)
        tile.save(OUT / f"{pieza}_vestibular.png", optimize=True)

    # Por tipo anatómico (reutilizable)
    for kind, src in TYPE_SOURCE.items():
        box = UPPER_TEETH.get(src) or LOWER_TEETH.get(src)
        if not box:
            continue
        tile = crop(im, box)
        tile = white_to_alpha(tile)
        tile.save(OUT / f"{kind}.png", optimize=True)

    # Vista previa compuesta debug
    preview = im.copy()
    from PIL import ImageDraw

    draw = ImageDraw.Draw(preview)
    for box in list(UPPER_TEETH.values()) + list(LOWER_TEETH.values()):
        x, y, w, h = box
        draw.rectangle((x, y, x + w, y + h), outline=(255, 0, 0), width=1)
    preview.save(OUT / "_debug_boxes.png")

    print(f"Saved {len(UPPER_TEETH) + len(LOWER_TEETH)} tooth PNGs to {OUT}")


if __name__ == "__main__":
    main()
