# -*- mode: python ; coding: utf-8 -*-
# PyInstaller onedir build for N&K DentalSoft Server.
# From repo root (with venv activated):
#   pyinstaller packaging/server/pyinstaller.spec

import sys
from pathlib import Path

block_cipher = None
ROOT = Path(SPECPATH).resolve().parents[1]
BACKEND = ROOT / "backend"

a = Analysis(
    [str(BACKEND / "boot.py") if (BACKEND / "boot.py").exists() else str(BACKEND / "app" / "main.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[
        (str(BACKEND / "alembic"), "alembic"),
        (str(BACKEND / "alembic.ini"), "."),
        (str(BACKEND / "app"), "app"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "apscheduler",
        "reportlab",
        "zeroconf",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="nkdentalsoft-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="nkdentalsoft-server",
)
