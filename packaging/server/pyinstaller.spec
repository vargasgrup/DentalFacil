# -*- mode: python ; coding: utf-8 -*-
# PyInstaller onedir build for N&K DentalSoft Server.
# Prefer: powershell packaging/scripts/build_server.ps1
# Manual:
#   pyinstaller packaging/server/pyinstaller.spec --noconfirm

from pathlib import Path

block_cipher = None
ROOT = Path(SPECPATH).resolve().parents[1]
BACKEND = ROOT / "backend"
SERVER_PKG = ROOT / "packaging" / "server"
FRONTEND_OUT = ROOT / "frontend" / "out"
DIST_DIR = SERVER_PKG / "dist"

_datas = [
    (str(BACKEND / "alembic"), "alembic"),
    (str(BACKEND / "alembic.ini"), "."),
    (str(BACKEND / "app"), "app"),
    # server_entry is imported from PYZ (do not also ship a loose .py — it shadows updates)
    (str(SERVER_PKG / "assets" / "icons"), "assets/icons"),
    (str(SERVER_PKG / "scripts"), "scripts"),
]
if (FRONTEND_OUT / "index.html").is_file():
    _datas.append((str(FRONTEND_OUT), "web"))

a = Analysis(
    [str(SERVER_PKG / "windows_service.py")],
    pathex=[str(BACKEND), str(SERVER_PKG)],
    binaries=[],
    datas=_datas,
    hiddenimports=[
        "server_entry",
        "desktop_runtime",
        "app.frontend_static",
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
        "cryptography",
        "cryptography.hazmat",
        "cryptography.hazmat.backends",
        "cryptography.hazmat.backends.openssl",
        "cryptography.hazmat.primitives",
        "cryptography.hazmat.primitives.asymmetric",
        "cryptography.hazmat.primitives.asymmetric.rsa",
        "cryptography.hazmat.primitives.hashes",
        "cryptography.hazmat.primitives.serialization",
        "cryptography.x509",
        "cryptography.x509.oid",
        "win32timezone",
        "pythoncom",
        "pywintypes",
        "servicemanager",
        "win32serviceutil",
        "win32service",
        "win32event",
        "webview",
        "webview.platforms",
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
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
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(SERVER_PKG / "assets" / "icons" / "icon.ico"),
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="nkdentalsoft-server",
)
