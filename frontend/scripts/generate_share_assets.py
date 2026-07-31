"""Generate OG + favicon assets from official N&K DentalSoft PNGs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC_ICON = Path(r"C:\PROYECTOS\Recursos DentalSoft\Icono.png")
SRC_LOGO = Path(r"C:\PROYECTOS\Recursos DentalSoft\Logo_DentalSoft.png")
PUBLIC = Path(r"C:\PROYECTOS\DentalSimple\frontend\public")
BRAND = PUBLIC / "brand"


def fit_square(im: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    resized = im.resize((size, size), Image.Resampling.LANCZOS)
    canvas.paste(resized, (0, 0), resized)
    return canvas


def main() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    icon = Image.open(SRC_ICON).convert("RGBA")
    logo = Image.open(SRC_LOGO).convert("RGBA")

    icon.save(BRAND / "Icono.png", optimize=True)
    logo.save(BRAND / "Logo_DentalSoft.png", optimize=True)
    icon.save(PUBLIC / "nkdentalsoft-icon.png", optimize=True)
    logo.save(PUBLIC / "Logo.png", optimize=True)

    for name, size in [
        ("favicon.png", 32),
        ("icon.png", 192),
        ("apple-icon.png", 180),
        ("nkdentalsoft-icon-192.png", 192),
        ("nkdentalsoft-icon-512.png", 512),
    ]:
        fit_square(icon, size).save(PUBLIC / name, optimize=True)

    ico_images = [fit_square(icon, s) for s in (16, 32, 48)]
    ico_images[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=ico_images[1:],
    )

    # WhatsApp / Open Graph — 1200×630 landscape card
    w, h = 1200, 630
    bg = Image.new("RGBA", (w, h), (6, 12, 28, 255))
    max_h = 520
    scale = min(max_h / icon.height, (w - 160) / icon.width)
    nw, nh = int(icon.width * scale), int(icon.height * scale)
    mark = icon.resize((nw, nh), Image.Resampling.LANCZOS)
    bg.paste(mark, ((w - nw) // 2, (h - nh) // 2), mark)
    og = bg.convert("RGB")
    og_path = PUBLIC / "og-image.png"
    og.save(og_path, format="PNG", optimize=True)

    print(f"og={og.size} bytes={og_path.stat().st_size}")
    for n in ("favicon.png", "icon.png", "apple-icon.png", "og-image.png"):
        p = PUBLIC / n
        print(f"{n}: {p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
