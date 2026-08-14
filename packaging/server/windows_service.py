"""
Windows entry for N&K DentalSoft Server (PyInstaller).

Desktop-first runtime (reliable on clinic PCs):
  nkdentalsoft-server.exe --desktop     # ensure listen + optional browser
  nkdentalsoft-server.exe --foreground  # long-running server (Task Scheduler)
  nkdentalsoft-server.exe --init-clinic
  nkdentalsoft-server.exe install|start|stop|remove  # optional legacy service
"""

from __future__ import annotations

import os
import sys
import threading
import time
import traceback
from pathlib import Path

from desktop_runtime import (
    DESKTOP_RETRY_WAIT_SECONDS,
    DESKTOP_WAIT_SECONDS,
    INPROCESS_WAIT_SECONDS,
    MUTEX_HELD_NOT_LISTENING,
    data_writable,
    diagnose_failure,
    foreground_log_path,
    http_ready,
    log_recently_written,
    port_open,
    server_ready,
    sibling_server_pids,
    terminate_pids,
    wait_until_ready,
)


def _boot_log(msg: str) -> None:
    """Log before server_entry is importable (service / early crashes)."""
    line = msg.rstrip() + "\n"
    try:
        pd = os.environ.get("PROGRAMDATA") or (os.environ.get("SystemDrive", "C:") + r"\ProgramData")
        path = Path(pd) / "NKDentalSoft" / "logs" / "startup.log"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line)
    except OSError:
        pass
    print(line, end="", flush=True)


def _install_dir() -> Path:
    # Frozen: ALWAYS the folder of the running EXE (never a stale env override
    # pointing at an older Program Files tree that shadows PYZ modules).
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    env = (os.environ.get("NKDENTALSOFT_INSTALL_DIR") or "").strip()
    if env and Path(env).is_dir():
        return Path(env).resolve()
    return Path(__file__).resolve().parent


def _purge_shadow_modules(*roots: Path) -> None:
    for root in roots:
        if not root:
            continue
        for stale in (
            root / "server_entry.py",
            root / "_internal" / "server_entry.py",
            root / "windows_service.py",
            root / "_internal" / "windows_service.py",
            root / "desktop_runtime.py",
            root / "_internal" / "desktop_runtime.py",
        ):
            try:
                if stale.is_file():
                    stale.unlink()
                    _boot_log(f"[boot] removed shadow module {stale}")
            except OSError as exc:
                _boot_log(f"[boot] could not remove {stale}: {exc}")


def _ensure_path() -> None:
    install = _install_dir()
    os.environ["NKDENTALSOFT_INSTALL_DIR"] = str(install)
    # Never inherit a polluted PROGRAMDATA from a parent shell (dev/smoke tests).
    if getattr(sys, "frozen", False):
        windir_pd = os.environ.get("SystemDrive", "C:") + r"\ProgramData"
        cur = (os.environ.get("PROGRAMDATA") or "").strip()
        real = str(Path(windir_pd).resolve())
        try:
            cur_ok = cur and Path(cur).resolve() == Path(real).resolve()
        except OSError:
            cur_ok = False
        if not cur_ok:
            os.environ["PROGRAMDATA"] = real

    try:
        os.chdir(install)
    except OSError:
        pass

    # Drop any prior sys.path entries that point at other NKDentalSoft trees
    # (e.g. Program Files leftover from NKDENTALSOFT_INSTALL_DIR in parent shells).
    cleaned: list[str] = []
    for entry in sys.path:
        try:
            low = str(entry).replace("\\", "/").lower()
            if "nkdentalsoft" in low and "server" in low:
                # keep only paths under this running install / its _MEIPASS
                if str(install.resolve()).replace("\\", "/").lower() in low:
                    cleaned.append(entry)
                elif getattr(sys, "_MEIPASS", None) and str(Path(sys._MEIPASS).resolve()).replace("\\", "/").lower() in low:
                    cleaned.append(entry)
                else:
                    _boot_log(f"[boot] dropping shadow path {entry}")
                    continue
            else:
                cleaned.append(entry)
        except Exception:
            cleaned.append(entry)
    sys.path[:] = cleaned

    meipass = getattr(sys, "_MEIPASS", None)
    # Only expose _MEIPASS for bundled datas. Never prepend install dir — that
    # allowed Program Files\_internal\server_entry.py to shadow the PYZ module.
    if meipass:
        mp = str(Path(meipass).resolve())
        if mp in sys.path:
            sys.path.remove(mp)
        sys.path.insert(0, mp)

    for candidate in (
        install / "web",
        Path(meipass) / "web" if meipass else None,
        install / "_internal" / "web",
    ):
        if candidate and (candidate / "index.html").is_file():
            os.environ["NKDENTALSOFT_UI_DIR"] = str(candidate.resolve())
            break

    pf = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "NKDentalSoft" / "Server"
    _purge_shadow_modules(install, pf, Path(meipass) if meipass else None)


def run_uvicorn() -> int:
    _ensure_path()
    # One long-lived API process per session (installer + Open-UI can race).
    if sys.platform == "win32":
        import ctypes

        ERROR_ALREADY_EXISTS = 183
        handle = ctypes.windll.kernel32.CreateMutexW(
            None, False, "Local\\NKDentalSoftServerForeground"
        )
        if handle and ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS:
            ctypes.windll.kernel32.CloseHandle(handle)
            port = int(os.environ.get("BACKEND_PORT", "8001"))
            if port_open(port) or http_ready(f"http://127.0.0.1:{port}/api/system/health"):
                _boot_log("[foreground] another instance is already listening — exiting")
                return 0
            _boot_log(
                "[foreground] mutex held but port closed — exiting "
                "(launcher will wait or recover the stale holder)"
            )
            return MUTEX_HELD_NOT_LISTENING
        # Keep handle alive for process lifetime (prevent GC closing mutex).
        run_uvicorn._instance_mutex = handle  # type: ignore[attr-defined]

    from server_entry import run_server

    run_server()
    return 0


def _start_foreground_detached(root: Path):
    """Start a hidden long-lived server; capture stdout/stderr to foreground.log."""
    import subprocess
    from datetime import datetime, timezone

    port = int(os.environ.get("BACKEND_PORT", "8001"))
    if port_open(port):
        return None

    exe = Path(sys.executable).resolve()
    log_path = foreground_log_path(root)
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        fh = log_path.open("a", encoding="utf-8", errors="replace")
        fh.write(f"\n--- detached --foreground {datetime.now(timezone.utc).isoformat()} ---\n")
        fh.flush()
    except OSError:
        fh = subprocess.DEVNULL

    creation = 0
    if sys.platform == "win32":
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
        creation = 0x00000008 | 0x00000200 | 0x08000000
    try:
        proc = subprocess.Popen(
            [str(exe), "--foreground"],
            cwd=str(_install_dir()),
            stdin=subprocess.DEVNULL,
            stdout=fh,
            stderr=fh,
            creationflags=creation,
        )
    finally:
        if fh is not subprocess.DEVNULL:
            try:
                fh.close()
            except OSError:
                pass
    return proc


def _browser_candidates() -> list[Path]:
    """Edge / Chrome install paths (Windows)."""
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LOCALAPPDATA", "")
    return [
        Path(pf) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(pf86) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(pf) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(pf86) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(local) / "Google" / "Chrome" / "Application" / "chrome.exe" if local else Path(),
    ]


def _resolve_brand_icon() -> Path | None:
    """Prefer installer icon.ico; fall back to embedded web favicon.ico."""
    install = _install_dir()
    candidates = [
        install / "assets" / "icons" / "icon.ico",
        install / "web" / "favicon.ico",
        Path(getattr(sys, "_MEIPASS", "") or "") / "web" / "favicon.ico",
    ]
    for c in candidates:
        if c and c.is_file():
            return c.resolve()
    return None


def _write_branded_app_shortcut(url: str, browser: Path, profile: Path) -> Path | None:
    """
    Create/update a .lnk that launches Edge/Chrome --app with the clinic icon.
    Launching via the .lnk (not the bare EXE) is what puts the brand icon on the
    Windows taskbar for Chromium app windows.
    """
    import json
    import subprocess
    import tempfile

    icon = _resolve_brand_icon()
    local = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
    app_dir = local / "NKDentalSoft"
    try:
        app_dir.mkdir(parents=True, exist_ok=True)
        profile.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None

    lnk = app_dir / "N&K DentalSoft.lnk"
    args = (
        f'--app={url} --user-data-dir="{profile}" '
        "--no-first-run --no-default-browser-check"
    )
    icon_loc = f"{icon},0" if icon else ""

    # WScript shortcut + AppUserModelID so Windows groups/shows our icon.
    ps = f"""
$ErrorActionPreference = 'Stop'
$lnkPath = {json.dumps(str(lnk))}
$target = {json.dumps(str(browser))}
$arguments = {json.dumps(args)}
$workDir = {json.dumps(str(browser.parent))}
$icon = {json.dumps(icon_loc)}
$appId = 'NKDentalSoft.ClinicUI'

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnkPath)
$s.TargetPath = $target
$s.Arguments = $arguments
$s.WorkingDirectory = $workDir
$s.WindowStyle = 1
$s.Description = 'N&K DentalSoft'
if ($icon) {{ $s.IconLocation = $icon }}
$s.Save()

# Stamp System.AppUserModel.ID on the .lnk (taskbar identity)
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class LnkAppId {{
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {{
    int GetCount(out uint cProps);
    int GetAt(uint iProp, out PROPERTYKEY pkey);
    int GetValue(ref PROPERTYKEY key, out PropVariant pv);
    int SetValue(ref PROPERTYKEY key, ref PropVariant pv);
    int Commit();
  }}
  [StructLayout(LayoutKind.Sequential, Pack=4)]
  struct PROPERTYKEY {{ public Guid fmtid; public uint pid; }}
  [StructLayout(LayoutKind.Explicit)]
  struct PropVariant {{
    [FieldOffset(0)] public ushort vt;
    [FieldOffset(8)] public IntPtr pszVal;
  }}
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  static extern void SHGetPropertyStoreFromParsingName(
    string pszPath, IntPtr pbc, uint flags, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, out IPropertyStore ppv);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant pvar);
  public static void Set(string path, string appId) {{
    var key = new PROPERTYKEY {{
      fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
      pid = 5
    }};
    IPropertyStore store;
    SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 2 /*GPS_READWRITE*/,
      typeof(IPropertyStore).GUID, out store);
    var pv = new PropVariant {{ vt = 31 /*VT_LPWSTR*/ }};
    pv.pszVal = Marshal.StringToCoTaskMemUni(appId);
    try {{
      store.SetValue(ref key, ref pv);
      store.Commit();
    }} finally {{
      PropVariantClear(ref pv);
      Marshal.ReleaseComObject(store);
    }}
  }}
}}
"@
try {{
  Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
  [LnkAppId]::Set($lnkPath, $appId)
}} catch {{
  # Shortcut still usable without AUMID
}}
"""
    ps_exe = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    if not ps_exe.is_file():
        return None
    script_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".ps1", delete=False, encoding="utf-8-sig"
        ) as fh:
            fh.write(ps)
            script_path = fh.name
        proc = subprocess.run(
            [
                str(ps_exe),
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0,
        )
        if proc.returncode != 0 or not lnk.is_file():
            return None
        return lnk
    except (OSError, subprocess.TimeoutExpired):
        return None
    finally:
        if script_path:
            try:
                os.unlink(script_path)
            except OSError:
                pass


def _open_clinic_ui(url: str) -> str:
    """
    Open UI as a dedicated app window with the N&K DentalSoft taskbar icon.
    Prefer launching a branded .lnk (IconLocation + AppUserModelID); fall back
    to Edge/Chrome --app, then the default browser.
    """
    import subprocess

    profile = (
        Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        / "NKDentalSoft"
        / "AppProfile"
    )
    try:
        profile.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    for browser in _browser_candidates():
        if not browser or not browser.is_file():
            continue

        lnk = _write_branded_app_shortcut(url, browser, profile)
        if lnk and lnk.is_file():
            try:
                os.startfile(str(lnk))  # type: ignore[attr-defined]
                return f"lnk:{browser.name}"
            except OSError:
                pass

        args = [
            str(browser),
            f"--app={url}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
        ]
        try:
            creation = 0
            if sys.platform == "win32":
                creation = 0x00000008 | 0x00000200
            subprocess.Popen(
                args,
                cwd=str(browser.parent),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation,
                close_fds=True,
            )
            return f"app:{browser.name}"
        except OSError:
            continue

    import webbrowser

    webbrowser.open(url)
    return "webbrowser"


def run_clinic_webview(url: str) -> int:
    """
    Host the clinic UI in a native WebView2 window owned by our EXE.

    Edge ``--app`` always shows the Edge taskbar icon. A pywebview host keeps
    the process as ``nkdentalsoft-server.exe`` (branded icon.ico).
    Returns 0 on clean close, 1 on failure (caller may fall back to browser).
    """
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(  # type: ignore[attr-defined]
            "NKDentalSoft.ClinicUI"
        )
    except Exception:
        pass

    try:
        import webview
    except ImportError:
        return 1

    icon = _resolve_brand_icon()

    class ClinicDesktopApi:
        """
        JS bridge for saves the WebView cannot do with <a download blob:>.
        Frontend: window.pywebview.api.save_file(filename, base64_content)
        """

        def save_file(self, filename: str, content_b64: str) -> dict:
            import base64
            import re

            try:
                raw_name = (filename or "documento").strip() or "documento"
                safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", raw_name)[:180]
                if not safe:
                    safe = "documento"
                try:
                    data = base64.b64decode(content_b64, validate=False)
                except Exception as exc:  # noqa: BLE001
                    return {"ok": False, "error": f"contenido inválido: {exc}"}

                windows = getattr(webview, "windows", None) or []
                win = windows[0] if windows else None
                path: str | None = None
                if win is not None and hasattr(win, "create_file_dialog"):
                    try:
                        # pywebview SAVE_DIALOG
                        save_flag = getattr(webview, "SAVE_DIALOG", 10)
                        file_types = ("All files (*.*)",)
                        lower = safe.lower()
                        if lower.endswith(".pdf"):
                            file_types = ("PDF (*.pdf)", "All files (*.*)")
                        elif lower.endswith(".csv"):
                            file_types = ("CSV (*.csv)", "All files (*.*)")
                        elif lower.endswith(".zip"):
                            file_types = ("ZIP (*.zip)", "All files (*.*)")
                        result = win.create_file_dialog(
                            save_flag,
                            directory="",
                            allow_multiple=False,
                            save_filename=safe,
                            file_types=file_types,
                        )
                        if not result:
                            return {"ok": False, "cancelled": True}
                        if isinstance(result, (list, tuple)):
                            path = str(result[0]) if result else None
                        else:
                            path = str(result)
                    except Exception as exc:  # noqa: BLE001
                        try:
                            from server_entry import log

                            log(f"desktop save dialog failed: {exc}")
                        except Exception:
                            pass
                        path = None

                if not path:
                    # Fallback: user Downloads (still better than silent no-op)
                    downloads = Path.home() / "Downloads"
                    try:
                        downloads.mkdir(parents=True, exist_ok=True)
                    except OSError:
                        downloads = Path.home()
                    path = str(downloads / safe)

                dest = Path(path)
                if dest.is_dir():
                    dest = dest / safe
                try:
                    dest.write_bytes(data)
                except OSError as exc:
                    return {"ok": False, "error": f"no se pudo escribir: {exc}"}
                return {"ok": True, "path": str(dest)}
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": str(exc)}

    def _go_fullscreen(win: object) -> None:
        """Fill the monitor: prefer maximize (taskbar visible), else true fullscreen."""
        for meth in ("maximize", "toggle_fullscreen"):
            fn = getattr(win, meth, None)
            if callable(fn):
                try:
                    fn()
                    return
                except Exception:
                    continue

    api = ClinicDesktopApi()
    try:
        window = webview.create_window(
            "N&K DentalSoft",
            url,
            width=1360,
            height=900,
            min_size=(960, 640),
            text_select=True,
            confirm_close=False,
            maximized=True,
            js_api=api,
        )
    except TypeError:
        try:
            window = webview.create_window(
                "N&K DentalSoft",
                url,
                width=1920,
                height=1080,
                min_size=(960, 640),
                fullscreen=True,
                js_api=api,
            )
        except TypeError:
            try:
                window = webview.create_window(
                    "N&K DentalSoft", url, width=1360, height=900, js_api=api
                )
            except TypeError:
                window = webview.create_window("N&K DentalSoft", url, width=1360, height=900)

    try:
        # Ensure maximized/fullscreen even if create_window ignored the flag
        if hasattr(window, "events") and hasattr(window.events, "loaded"):
            window.events.loaded += lambda: _go_fullscreen(window)
        else:
            _go_fullscreen(window)
    except Exception:
        pass

    start_kwargs: dict = {"private_mode": False}
    if icon and icon.is_file():
        # branded icon when supported by backend
        try:
            start_kwargs["icon"] = str(icon)
        except Exception:
            pass
    try:
        webview.start(**start_kwargs)
        return 0
    except TypeError:
        try:
            webview.start(private_mode=False)
            return 0
        except Exception as exc:
            try:
                from server_entry import log

                log(f"webview failed: {exc}")
            except Exception:
                pass
            return 1
    except Exception as exc:
        try:
            from server_entry import log

            log(f"webview failed: {exc}")
        except Exception:
            pass
        return 1


def _desktop_ready(port: int, use_tls: bool) -> bool:
    return server_ready(port, use_tls=use_tls)


def _print_desktop_progress(msg: str) -> None:
    print(msg, flush=True)


def _wait_for_server(port: int, use_tls: bool, log, *, timeout: float, child=None, thread=None):
    def _child_alive():
        if thread is not None:
            return thread.is_alive()
        if child is None:
            siblings = sibling_server_pids()
            return bool(siblings)
        return child.poll() is None

    watch_child = child is not None or thread is not None or bool(sibling_server_pids())
    return wait_until_ready(
        timeout=timeout,
        is_ready=lambda: _desktop_ready(port, use_tls),
        child_alive=_child_alive if watch_child else None,
        log_progress=lambda m: (log(f"desktop: {m}"), _print_desktop_progress(m)),
    )


def _recover_stale_servers(log, root: Path) -> list[int]:
    stale = sibling_server_pids()
    if not stale:
        return []
    startup = root / "logs" / "startup.log"
    if log_recently_written(startup):
        log("desktop: sibling still writing startup.log — not killing (bootstrap in progress)")
        return []
    log(f"desktop: terminating stale server PID(s) {stale} (not listening, log idle)")
    return terminate_pids(stale)


def run_desktop(open_browser: bool = True) -> int:
    """Ensure the API/UI is reachable, then open the branded clinic window."""
    _ensure_path()
    from server_entry import prepare_environment, log

    root = prepare_environment()
    port = int(os.environ.get("BACKEND_PORT", "8001"))
    cert = root / "certs" / "server.crt"
    use_tls = cert.is_file() and (root / "certs" / "server.key").is_file()
    # Prefer HTTP for local Firefox reliability unless TLS forced
    force_tls = (os.environ.get("NKDENTALSOFT_FORCE_TLS") or "").strip() in {"1", "true", "yes"}
    prefer_http = (os.environ.get("NKDENTALSOFT_DESKTOP_HTTP") or "1").strip() not in {
        "0",
        "false",
        "no",
    }
    if prefer_http and not force_tls:
        os.environ["NKDENTALSOFT_DISABLE_TLS"] = "1"
        use_tls = False

    url = f"{'https' if use_tls else 'http'}://127.0.0.1:{port}/"
    log(f"desktop ensure url={url} (local UI only; API binds HOST=0.0.0.0 for LAN)")
    _print_desktop_progress("Iniciando N&K DentalSoft. No cierre esta ventana…")
    _print_desktop_progress(
        "El primer arranque (o una actualización con pacientes) puede tardar unos minutos."
    )

    if _desktop_ready(port, use_tls):
        log("desktop: server already serving")
    else:
        siblings = sibling_server_pids()
        # Nothing else is starting up: a read-only data dir will never open the port,
        # so say so now instead of timing out for minutes.
        if not siblings:
            writable, why = data_writable(root)
            if not writable:
                log(f"desktop: clinic data not writable — {why}")
                print(
                    "\nNo se puede iniciar N&K DentalSoft con este usuario.\n"
                    f"{why}\n\n"
                    "Solucion (una sola vez, como Administrador):\n"
                    f"  {_install_dir() / 'scripts' / 'repair_startup.cmd'}\n\n"
                    "Despues el sistema abrira con doble clic, sin Administrador.\n",
                    flush=True,
                )
                return 1
        child = None
        if siblings:
            log(f"desktop: waiting for existing server PID(s) {siblings} (no second instance)")
            _print_desktop_progress("Hay un servidor en marcha. Esperando a que abra el puerto…")
        else:
            log("desktop: port closed — starting detached --foreground")
            child = _start_foreground_detached(root)
            if child is not None:
                log(f"desktop: detached PID={child.pid}")

        result = _wait_for_server(
            port, use_tls, log, timeout=DESKTOP_WAIT_SECONDS, child=child
        )
        if result.ok:
            log(f"desktop: ready after {result.elapsed:.1f}s ({result.reason})")
        else:
            log(f"desktop: first wait failed ({result.reason}) after {result.elapsed:.1f}s")
            startup_log = root / "logs" / "startup.log"
            if log_recently_written(startup_log) and sibling_server_pids():
                log("desktop: bootstrap still in progress — extending wait")
                _print_desktop_progress("Migrando datos de la clínica. Espere, no cierre la ventana…")
                result = _wait_for_server(
                    port, use_tls, log, timeout=DESKTOP_WAIT_SECONDS, child=child
                )
            if result.ok or _desktop_ready(port, use_tls):
                log(f"desktop: ready after extended wait ({result.reason})")
            else:
                _recover_stale_servers(log, root)
                time.sleep(1.5)
                if _desktop_ready(port, use_tls):
                    log("desktop: ready after stale-process recovery")
                else:
                    log("desktop: retry detached --foreground")
                    child = _start_foreground_detached(root)
                    result = _wait_for_server(
                        port, use_tls, log, timeout=DESKTOP_RETRY_WAIT_SECONDS, child=child
                    )
                    if not result.ok and not _desktop_ready(port, use_tls):
                        log("desktop: detached failed — starting API in this process")
                        _recover_stale_servers(log, root)
                        time.sleep(1.0)
                        _print_desktop_progress("Arranque interno de respaldo…")
                        worker = threading.Thread(
                            target=run_uvicorn, name="nkds-inprocess", daemon=True
                        )
                        worker.start()
                        result = _wait_for_server(
                            port,
                            use_tls,
                            log,
                            timeout=INPROCESS_WAIT_SECONDS,
                            thread=worker,
                        )
                    if result.ok or _desktop_ready(port, use_tls):
                        log(f"desktop: ready after fallback ({result.reason})")
                    else:
                        log("desktop: FATAL — server did not open port")
                        detail = diagnose_failure(
                            startup_log,
                            foreground_log_path(root),
                        )
                        print(
                            f"\nNo responde {url}\n"
                            f"Revise: {startup_log}\n"
                            f"También: {foreground_log_path(root)}\n"
                            "Ejecute como Administrador: scripts\\repair_startup.cmd\n",
                            flush=True,
                        )
                        if detail:
                            print(detail, flush=True)
                        return 1

    if not open_browser:
        return 0

    # Prefer native WebView2 host (branded taskbar icon). Fall back to Edge --app.
    force_browser = (os.environ.get("NKDENTALSOFT_FORCE_BROWSER") or "").strip() in {
        "1",
        "true",
        "yes",
    }
    if not force_browser:
        log("desktop: opening native WebView2 clinic window")
        code = run_clinic_webview(url)
        if code == 0:
            return 0
        log("desktop: webview unavailable — falling back to browser app mode")

    how = _open_clinic_ui(url)
    log(f"desktop: opened UI via {how} → {url}")
    return 0


try:
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil
except ImportError:
    servicemanager = None  # type: ignore
    win32event = None  # type: ignore
    win32service = None  # type: ignore
    win32serviceutil = None  # type: ignore


if win32serviceutil is not None:

    class NKDentalSoftServerService(win32serviceutil.ServiceFramework):
        _svc_name_ = "NKDentalSoftServer"
        _svc_display_name_ = "N&K DentalSoft Server"
        _svc_description_ = (
            "API FastAPI + SQLite for N&K DentalSoft clinic LAN."
        )

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._worker: threading.Thread | None = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self.stop_event)
            # Hard stop — avoids zombie service when uvicorn ignores signals
            os._exit(0)

        def SvcDoRun(self):
            _ensure_path()
            _boot_log("[service] SvcDoRun begin")
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )

            def _worker():
                try:
                    run_uvicorn()
                    _boot_log("[service] run_uvicorn returned (unexpected)")
                except Exception:
                    _boot_log("[service] FATAL in worker:\n" + traceback.format_exc())
                finally:
                    win32event.SetEvent(self.stop_event)

            self._worker = threading.Thread(target=_worker, name="nkds-uvicorn", daemon=True)
            self._worker.start()
            win32event.WaitForSingleObject(self.stop_event, win32event.INFINITE)
            _boot_log("[service] SvcDoRun end — marking stopped")
            # If worker died, leave process so SCM can restart (Recovery options)
            os._exit(1)


def _pause() -> None:
    try:
        input("\nPresione Enter para cerrar...")
    except Exception:
        time.sleep(15)


def main() -> None:
    _ensure_path()
    argv = sys.argv[1:]
    lowered = [a.lower() for a in argv]

    try:
        if "--init-clinic" in lowered:
            from server_entry import init_clinic

            host = None
            for i, a in enumerate(argv):
                if a.lower() == "--host" and i + 1 < len(argv):
                    host = argv[i + 1]
                    break
            init_clinic(host)
            print("Init clinic OK", flush=True)
            return

        if "--desktop" in lowered:
            code = run_desktop(open_browser="--no-browser" not in lowered)
            if code != 0:
                _pause()
            sys.exit(code)

        if "--foreground" in lowered or "-f" in lowered:
            # Desktop HTTP by default (Firefox / no cert warning on same PC)
            if (os.environ.get("NKDENTALSOFT_FORCE_TLS") or "").strip() not in {
                "1",
                "true",
                "yes",
            }:
                os.environ.setdefault("NKDENTALSOFT_DISABLE_TLS", "1")
            code = run_uvicorn()
            if code:
                sys.exit(code)
            return

        if win32serviceutil is None:
            print("pywin32 not installed — running desktop mode", flush=True)
            sys.exit(run_desktop())

        svc_cmds = {"install", "remove", "start", "stop", "restart", "update", "debug"}
        if svc_cmds.intersection(lowered) or "--startup" in lowered:
            if getattr(sys, "frozen", False):
                sys.argv[0] = sys.executable
            win32serviceutil.HandleCommandLine(NKDentalSoftServerService)
            return

        # Double-click EXE / no args → desktop launcher (not SCM dispatcher)
        if getattr(sys, "frozen", False) and not argv:
            sys.exit(run_desktop())

        sys.exit(run_desktop())
    except Exception as exc:
        _boot_log(f"[nkdentalsoft-server] FATAL: {exc}\n{traceback.format_exc()}")
        print(f"[nkdentalsoft-server] FATAL: {exc}", flush=True)
        traceback.print_exc()
        log_hint = (
            Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData"))
            / "NKDentalSoft"
            / "logs"
            / "startup.log"
        )
        print(f"\nRevise el log: {log_hint}\n", flush=True)
        if "--foreground" in lowered or "-f" in lowered or "--desktop" in lowered or not argv:
            _pause()
        sys.exit(1)


if __name__ == "__main__":
    main()
