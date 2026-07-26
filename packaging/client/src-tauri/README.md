# src-tauri — Cliente N&K DentalSoft

Crate Tauri 2 listo para `cargo tauri build` (requiere Rust + WebView2 en la PC de build).

## Comandos Rust expuestos al wizard (`ui/index.html`)

| Comando | Uso |
|---|---|
| `discover_servers` | Browse mDNS `_nkdentalsoft._tcp.local.` (stub vacío hasta habilitar `mdns-sd`) |
| `get_cert_fingerprint` | Normaliza huella hex o SHA-256(DER hex) |
| `validate_fingerprint` | Valida TOFU (64 hex) |
| `navigate_to_server` | Carga `https://…` en el webview `main` |

## Iconos

Generados desde el arte de marca:

```powershell
python packaging\scripts\generate_icons.py
```

Quedan en `src-tauri/icons/` (`32x32`, `128x128`, `128x128@2x`, `icon.ico`).

## Build

```powershell
# Una vez: rustup + cargo install tauri-cli --version "^2"
cd packaging\client\src-tauri
cargo tauri build
```

Salida NSIS: `src-tauri/target/release/bundle/nsis/`.
