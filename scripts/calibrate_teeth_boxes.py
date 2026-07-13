"""Calibrar cajas de recorte sobre Odontograma.jpg."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "Odontograma.jpg"
OUT = ROOT / "frontend" / "public" / "dientes" / "referencia"

W, H = 1163, 912
MID_GAP = (458, 502)  # columna central sin dientes


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    arr = np.array(im)
    gray = arr.mean(axis=2)
    ink = gray < 235

    # Filas con dientes (excluir leyenda superior)
    row_sum = ink[350:620, :].sum(axis=1)
    peaks = []
    for i, v in enumerate(row_sum):
        if v > 800:
            peaks.append(i + 350)
    print("dense rows sample:", peaks[:5], "...", peaks[-5:])

    # Columnas en banda superior de dientes
    y0, y1 = 398, 518
    col_sum = ink[y0:y1, :].sum(axis=0)
    # 16 dientes + gap central
    xs = []
    i = 60
    while i < W - 60:
        if MID_GAP[0] <= i <= MID_GAP[1]:
            i = MID_GAP[1] + 1
            continue
        window = col_sum[max(0, i - 8) : i + 8].sum()
        if window > 120:
            xs.append(i)
        i += 1

    # Agrupar picos cercanos
    groups: list[int] = []
    for x in xs:
        if not groups or x - groups[-1] > 18:
            groups.append(x)
        else:
            groups[-1] = (groups[-1] + x) // 2
    print("tooth columns", len(groups), groups)

    upper = [
        "18",
        "17",
        "16",
        "15",
        "14",
        "13",
        "12",
        "11",
        "21",
        "22",
        "23",
        "24",
        "25",
        "26",
        "27",
        "28",
    ]
    lower = [
        "48",
        "47",
        "46",
        "45",
        "44",
        "43",
        "42",
        "41",
        "31",
        "32",
        "33",
        "34",
        "35",
        "36",
        "37",
        "38",
    ]

    tooth_w = 42
    tooth_h = 108
    upper_y = 402
    lower_y = 556

    preview = im.copy()
    draw = ImageDraw.Draw(preview)
    boxes: dict[str, tuple[int, int, int, int]] = {}

    for pieza, cx in zip(upper, groups[:16]):
        x = cx - tooth_w // 2
        boxes[pieza] = (x, upper_y, tooth_w, tooth_h)
        draw.rectangle((x, upper_y, x + tooth_w, upper_y + tooth_h), outline=(255, 0, 0))

    for pieza, cx in zip(lower, groups[:16]):
        x = cx - tooth_w // 2
        boxes[pieza] = (x, lower_y, tooth_w, tooth_h)
        draw.rectangle((x, lower_y, x + tooth_w, lower_y + tooth_h), outline=(0, 0, 255))

    preview.save(OUT / "_debug_boxes2.png")
    print("boxes written", len(boxes))
    for k, v in list(boxes.items())[:4]:
        print(k, v)


if __name__ == "__main__":
    main()
