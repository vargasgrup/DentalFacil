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
# Una vez: winget install Python.Python.3.12 NSIS.NSIS
# Requiere Node 20+ para embeber la UI (npm run build:desktop → frontend/out)
powershell -ExecutionPolicy Bypass -File packaging\scripts\build_server.ps1
```

Salida: `dist\NKDentalSoft-Server-Setup-x64.exe` (+ onedir en `packaging\server\dist\nkdentalsoft-server\`).

El instalador del Servidor incluye la **UI Next.js exportada** (`web/`) servida por FastAPI en el mismo puerto HTTPS (8001). Los Clientes Tauri abren `https://SERVIDOR:8001/` y usan `/api/*` en el mismo origen.

## Actualizacion / upgrade

El instalador **detiene el servicio y mata** `nkdentalsoft-server.exe` antes de sobrescribir archivos.  
Si aparece “Error abriendo archivo para escritura”, cierre la ventana negra del Servidor y pulse **Reintentar**, o ejecute como Admin:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\NKDentalSoft\Server\scripts\stop_for_upgrade.ps1"
```

Luego vuelva a lanzar el Setup. Los secretos en `%ProgramData%\NKDentalSoft\config\.env` **no se regeneran** en una actualización.

Servicio (plan A pywin32, embebido en el `.exe`):

```powershell
nkdentalsoft-server.exe --startup auto install
nkdentalsoft-server.exe start
# Depuración:
nkdentalsoft-server.exe --foreground
nkdentalsoft-server.exe --init-clinic
```

Plan B: NSSM apuntando a `nkdentalsoft-server.exe --foreground`.

Firewall: solo perfiles **Privado** y **Dominio**, puerto 8001.

mDNS: servicio `_nkdentalsoft._tcp.local.` con propiedad `fp` = fingerprint SHA-256 (TOFU).

## Iconos de marca

Arte N&K DentalSoft (PNG transparente). Fuente preferida:

`C:\PROYECTOS\Recursos DentalSoft\Icono.png`

```powershell
python packaging\scripts\generate_icons.py
```

Salida: `packaging/client/icons/`, `packaging/client/src-tauri/icons/`, `packaging/server/assets/icons/`, favicons en `frontend/public/`.

## Build Cliente (Tauri)

```powershell
# Una vez: winget install Rustlang.Rustup
#          cargo install tauri-cli --version "^2"
powershell -ExecutionPolicy Bypass -File packaging\scripts\build_client.ps1 -SkipInstallCli
```

Salida: `dist\NKDentalSoft-Client-Setup-x64.exe`.

Wizard (`packaging/client/ui/`): mDNS → IP + fingerprint TOFU → `https://`/`wss://` únicamente.  
Comandos nativos: `discover_servers`, `validate_fingerprint`, `navigate_to_server`.  
Updater: `GET /api/system/client-manifest.json` en el Servidor LAN (plugin Tauri opcional en v1.1).

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
