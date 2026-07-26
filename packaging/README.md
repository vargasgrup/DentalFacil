# Packaging — N&K DentalSoft (Servidor + Cliente LAN)

Arquitectura: **1 Servidor Windows** (FastAPI + SQLite local + HTTPS) y **N Clientes Tauri** (WebView sin BD).  
SQLite **nunca** en carpeta compartida SMB.

## Requisitos de build

| Componente | Requisito |
|---|---|
| Server exe | Python 3.11+, `pip install -r backend/requirements.txt pyinstaller pywin32 zeroconf cryptography` |
| Server installer | [NSIS 3](https://nsis.sourceforge.io/) |
| Client | [Rust](https://rustup.rs/) + Tauri CLI 2 (`cargo install tauri-cli`) |
| Frontend estático (opcional) | Node 20+, `next build` (SSR actual: en v1 el Cliente apunta al UI servido por el Server o proxy) |

## Secretos de producción (obligatorio)

```powershell
python packaging/server/scripts/generate_production_secrets.py
python packaging/server/scripts/generate_selfsigned_cert.py --host 192.168.1.10
```

- Genera `JWT_SECRET` y `MAINTENANCE_ACCESS_KEY` únicos.
- Fuerza `APP_ENV=production`.
- Rechaza la clave legacy `Solo,yo1532`.
- Escribe en `%ProgramData%\NKDentalSoft\config\.env` y certificados en `...\certs\`.
- **Nunca** copiar `docker-compose.yml` env a una PC de clínica.

Post-install:

```powershell
powershell -ExecutionPolicy Bypass -File packaging/server/scripts/post_install_healthcheck.ps1
```

## Build Servidor

```powershell
cd backend
pyinstaller ..\packaging\server\pyinstaller.spec
# Copiar salida a packaging/server/dist/nkdentalsoft-server/
makensis packaging\server\installer.nsi
```

Servicio (plan A pywin32):

```powershell
python packaging\server\windows_service.py --startup auto install
python packaging\server\windows_service.py start
```

Plan B: NSSM apuntando a `nkdentalsoft-server.exe` / `windows_service.py` foreground.

Firewall: solo perfiles **Privado** y **Dominio**, puerto 8001.

mDNS: servicio `_nkdentalsoft._tcp.local.` con propiedad `fp` = fingerprint SHA-256 (TOFU).

## Build Cliente (Tauri)

```powershell
cd packaging\client
# Completar src-tauri con `cargo create-tauri-app` si aún no existe el crate Rust
# Colocar iconos en packaging/client/icons/
cargo tauri build
```

Wizard: descubrimiento mDNS → muestra IP + fingerprint → pinning local → `https://`/`wss://` únicamente.  
Updater: `GET /api/system/client-manifest.json` en el Servidor LAN.

## API de sistema

| Endpoint | Uso |
|---|---|
| `GET /api/system/health` | Conectividad / post-install |
| `GET /api/system/version` | Versión de producto |
| `GET /api/system/env-check` | ADMIN: secretos OK sin filtrar valores |
| `GET /api/system/client-manifest.json` | Feed updater Tauri |
| `WS /api/ws?token=` | Sync en tiempo real |

## Despliegue en clínica

1. Reservar IP del Servidor en el router (recomendado).
2. Instalar `NKDentalSoft-Server-Setup-x64.exe` en la PC Servidor (encendida en horario).
3. Instalar Cliente en cada terminal; confirmar fingerprint TOFU una vez.
4. Verificar Topbar: indicador **En línea**.

## TLS / TOFU

HTTPS obligatorio desde v1. El Cliente fija el fingerprint; si cambia, bloquea hasta confirmación explícita (reinstalación o MITM).

## Fuera de alcance (sprint negocio)

ACL `require_module` en APIs clínicas, anulación de caja, forzar `America/Lima` en builders de agenda.
