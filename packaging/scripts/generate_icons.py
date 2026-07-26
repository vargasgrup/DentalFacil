"""Generate Windows/Tauri/web icons from N&K DentalSoft brand art."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "packaging" / "client" / "icons" / "icon-source.png"


def center_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def main() -> None:
    img = Image.open(SRC).convert("RGBA")
    sq = center_square(img)

    client_icons = ROOT / "packaging" / "client" / "icons"
    server_icons = ROOT / "packaging" / "server" / "assets" / "icons"
    public = ROOT / "frontend" / "public"
    for d in (client_icons, server_icons, public):
        d.mkdir(parents=True, exist_ok=True)

    master = client_icons / "icon-master.png"
    sq.resize((1024, 1024), Image.Resampling.LANCZOS).save(master, "PNG")

    for folder in (client_icons, server_icons):
        for s in (16, 32, 48, 64, 128, 256):
            sq.resize((s, s), Image.Resampling.LANCZOS).save(folder / f"{s}x{s}.png", "PNG")

    # Tauri expected extras
    sq.resize((256, 256), Image.Resampling.LANCZOS).save(client_icons / "128x128@2x.png", "PNG")

    # Web / PWA favicons
    sq.resize((32, 32), Image.Resampling.LANCZOS).save(public / "favicon.png", "PNG")
    sq.resize((32, 32), Image.Resampling.LANCZOS).save(public / "icon.png", "PNG")
    sq.resize((180, 180), Image.Resampling.LANCZOS).save(public / "apple-icon.png", "PNG")
    sq.resize((192, 192), Image.Resampling.LANCZOS).save(public / "nkdentalsoft-icon-192.png", "PNG")
    sq.resize((512, 512), Image.Resampling.LANCZOS).save(public / "nkdentalsoft-icon-512.png", "PNG")
    sq.resize((512, 512), Image.Resampling.LANCZOS).save(public / "nkdentalsoft-icon.png", "PNG")

    # Pillow derives each ICO frame from a single large source via `sizes=`.
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_src = sq.resize((256, 256), Image.Resampling.LANCZOS)
    for folder in (client_icons, server_icons):
        ico_src.save(folder / "icon.ico", format="ICO", sizes=ico_sizes)

    # Tauri bundle expects icons next to tauri.conf.json (src-tauri/icons).
    tauri_icons = ROOT / "packaging" / "client" / "src-tauri" / "icons"
    tauri_icons.mkdir(parents=True, exist_ok=True)
    for name in ("32x32.png", "128x128.png", "128x128@2x.png", "icon.ico", "icon-master.png"):
        src = client_icons / name
        if src.exists():
            (tauri_icons / name).write_bytes(src.read_bytes())

    ui_assets = ROOT / "packaging" / "client" / "ui" / "assets"
    ui_assets.mkdir(parents=True, exist_ok=True)
    (ui_assets / "icon-32.png").write_bytes((client_icons / "32x32.png").read_bytes())
    (ui_assets / "icon-128.png").write_bytes((client_icons / "128x128.png").read_bytes())

    print(f"Wrote icons under {client_icons} and {server_icons}")
    print(f"Copied Tauri icons to {tauri_icons}")
    print(f"Web favicons updated in {public}")


if __name__ == "__main__":
    main()
