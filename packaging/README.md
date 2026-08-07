# Packaging — N&K DentalSoft (generadores de instaladores)

Documentación operativa del **generador de instaladores** Windows (Server + Client).  
Actualizada **2026-07-27** tras verificación en clínica de la conexión LAN.

> **CONGELADO — conexiones LAN**  
> Cliente ↔ Servidor está **verificado y funcional**. No modificar la configuración ni el código de red/conexión (ver § [Conexiones congeladas](#conexiones-congeladas) y regla Cursor `.cursor/rules/lan-client-server-freeze.mdc`).  
> El trabajo futuro debe centrarse en otros aspectos del producto; los builds de instaladores pueden regenerarse **sin** alterar esos archivos.

---

## Carpeta / unidad de instalación y Windows «Aplicaciones»

Los instaladores Server y Client (NSIS):

1. Muestran la **página de carpeta de destino** antes de copiar archivos (`MUI_PAGE_DIRECTORY`).
2. Permiten elegir **otra unidad o ruta** (p. ej. `D:\NKDentalSoft\Server`).
3. Recuerdan la última ruta con `InstallDirRegKey` (reinstalaciones).
4. Registran la app en  
   `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\…`  
   para que aparezcan en **Configuración → Aplicaciones → Aplicaciones instaladas** (Windows 11) y se puedan desinstalar con limpieza de archivos/accesos/claves de registro del producto.

| Producto | Clave Uninstall |
|----------|-----------------|
| Server | `…\Uninstall\NKDentalSoftServer` |
| Client | `…\Uninstall\NKDentalSoftClient` |

Datos clínicos del Server (`%ProgramData%\NKDentalSoft\data` y config) se conservan al desinstalar por la UI de Windows. Limpieza total: `NKDentalSoft-Clean-All-x64.exe`.

---

## Arquitectura de despliegue (clínica)

| Rol | Artefacto | Qué es |
|-----|-----------|--------|
| **Servidor** | `dist\NKDentalSoft-Server-Setup-x64.exe` | FastAPI + SQLite local + UI Next.js estática embebida (`web/`). Escucha **HTTP `0.0.0.0:8001`**. |
| **Cliente** | `dist\NKDentalSoft-Client-Setup-x64.exe` | Estación LAN: `ConnectClinic.exe` (WinForms) abre Edge `--app` hacia la URL del Server. **Sin base de datos.** |

- Una sola PC **Server** (encendida en horario); N PCs **Client**.
- SQLite **nunca** en carpeta SMB compartida.
- Los Clients usan la **IP numérica** del Server (`http://192.168.x.x:8001/`), no nombres `DESKTOP-…`.
- Same-origin: la UI del Server en `:8001` llama a `/api/*` sin `NEXT_PUBLIC_API_URL` hardcodeado a otro host.

---

## Requisitos de máquina de build

| Herramienta | Uso |
|-------------|-----|
| Windows 10/11 x64 | Host de empaquetado |
| Python **3.12** | PyInstaller Server (`.venv-build`) |
| Node **20+** | `npm run build:desktop` → `frontend/out` |
| [NSIS 3](https://nsis.sourceforge.io/) (`makensis`) | Instaladores `.exe` |
| .NET Framework / Roslyn `csc` | Compilar `ConnectClinic.exe` |
| (Opcional) Rust + Tauri CLI 2 | Camino alterno Client; en práctica se usa **NSIS + ConnectClinic** (`-ForceNsis`) |

Firma Authenticode (si hay certificado local): `packaging/scripts/sign_windows_exe.ps1`.

---

## Mapa de scripts (generadores)

```
packaging/
├── README.md                          ← este documento
├── scripts/
│   ├── build_all.ps1                  ← Server + Client → dist\
│   ├── build_server.ps1               ← generador instalador SERVER
│   ├── build_client.ps1               ← generador instalador CLIENT
│   ├── build_client_connector.ps1     ← csc → ConnectClinic.exe  [CONGELADO lógica]
│   ├── sign_windows_exe.ps1
│   ├── generate_icons.py
│   └── allow_local_installers.ps1
├── server/
│   ├── installer.nsi                  ← NSIS Server
│   ├── pyinstaller.spec
│   ├── server_entry.py                ← entry runtime  [HOST LAN CONGELADO]
│   ├── Start-Server.bat / Open-UI.bat
│   ├── Reparar-Red-LAN.bat
│   ├── Activar-Hotspot-Clinica.bat
│   └── scripts/                       ← repair_lan, hotspot, upgrade, healthcheck…
└── client/
    ├── installer.nsi                  ← NSIS Client
    ├── ConnectClinic.cs               ← conector nativo  [CONGELADO]
    ├── ConnectClinic.exe              ← salida del connector (build)
    └── Open-Client.bat / Change-Server.bat
```

Artefactos finales (no versionar binarios grandes en git si el repo lo evita):

| Salida | Ruta |
|--------|------|
| Setup Server | `dist\NKDentalSoft-Server-Setup-x64.exe` |
| Setup Client | `dist\NKDentalSoft-Client-Setup-x64.exe` |
| Onedir Server (debug) | `packaging\server\dist\nkdentalsoft-server\` |

---

## Build Servidor (`build_server.ps1`)

### Qué hace (pipeline)

1. Crea/usa venv `.venv-build` con Python 3.12.
2. Instala deps backend + `pyinstaller`, `pywin32`, `pywebview` (salvo `-SkipDeps`).
3. Regenera iconos de marca si hay recursos.
4. **Frontend:** `npm run build:desktop` → `frontend/out` (salvo `-SkipFrontend`; exige `out/index.html` previo).
5. **PyInstaller** onedir (`packaging/server/pyinstaller.spec`) → `nkdentalsoft-server.exe`.
6. Copia `web/`, `scripts/`, BATs e iconos junto al onedir.  
   **No** copiar `server_entry.py` suelto al lado del EXE (ensombrece el módulo frozen).
7. **NSIS** (`installer.nsi`) → Setup en `dist\` (vía `.build.exe` intermedio si el Setup anterior está bloqueado).
8. Firma Authenticode si está disponible.

### Comandos

```powershell
# Build completo (UI + EXE + instalador)
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_server.ps1

# Solo reempaquetar backend (UI ya en frontend\out)
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_server.ps1 -SkipFrontend

# Onedir sin NSIS
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_server.ps1 -SkipNsis
```

### Parámetros

| Switch | Efecto |
|--------|--------|
| `-SkipFrontend` | No corre `build:desktop`; exige `frontend\out\index.html` |
| `-SkipDeps` | No reinstala pip deps |
| `-SkipNsis` | Solo onedir PyInstaller |

### Post-instalación en PC clínica (Server)

1. Ejecutar Setup como Administrador.
2. Primera vez: `--init-clinic` genera secretos en `%ProgramData%\NKDentalSoft\config\.env` (en upgrades **no** se regeneran).
3. Arrancar Server; abrir UI (`Open-UI.bat` / acceso local `http://127.0.0.1:8001/`).
4. En **Configuración**: copiar la **URL actual** para Clients (IP Ethernet preferida).
5. Atajos: **Reparar red LAN**, **Activar Hotspot clinica** (enciende Mobile Hotspot por API WinRT, deja SSID/clave/URL en pantalla y en `%ProgramData%\NKDentalSoft\HOTSPOT.txt`; la ventana ya no se cierra sola).

### Actualización sobre una instalación previa (in-place)

El Setup **es el actualizador**. No hay un “hotfix” aparte: generar un instalador nuevo y ejecutarlo en la PC Server **como Administrador**.

Flujo 4.0.1+ (obligatorio para que los cambios de UI/código se vean):

1. **Detiene** todos los `nkdentalsoft-server.exe` y libera el puerto **8001** (en la carpeta real: `E:\Server`, `D:\…` o Program Files — se pasa `-InstallDir`).
2. **Purga** el árbol de producto (`web/`, `_internal/`, EXE, residuos `*.old_*`). **No toca** `%ProgramData%\NKDentalSoft` (pacientes, `.env`, medios).
3. **Copia limpia** del onedir del build actual (incluye `BUILD_ID`).
4. **Re-registra** la tarea programada apuntando a **esa** carpeta e inicia el Server.
5. Limpia caché local de pywebview cuando es posible.
6. Healthcheck verifica UI + `BUILD_ID` (`/api/system/ui-root`).

Reglas de clínica:

- Elija **la misma carpeta** ya instalada (p. ej. `E:\Server`). Si elige otra, conviven **dos** Servers y el acceso/atajos pueden abrir el viejo.
- Cierre la ventana de N&K DentalSoft antes del Setup.
- Tras actualizar, compruebe `http://127.0.0.1:8001/api/system/ui-root` → `build_id` nuevo.

Si un upgrade falla por archivo en uso:

```powershell
powershell -ExecutionPolicy Bypass -File "E:\Server\scripts\stop_for_upgrade.ps1" -InstallDir "E:\Server" -AllowRename
```

(Sustituya por la ruta real en el equipo.)

---

## Build Cliente (`build_client.ps1`)

### Camino oficial verificado (clínica)

**NSIS + `ConnectClinic.exe`** (único camino para clínicas; default del script):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_client.ps1
# equivalente explícito:
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_client.ps1 -ForceNsis
```

Pipeline:

1. `build_client_connector.ps1` → compila `ConnectClinic.cs` → `ConnectClinic.exe`.
2. Firma el connector (si hay cert).
3. `makensis packaging\client\installer.nsi` → `dist\NKDentalSoft-Client-Setup-x64.exe`.
4. Firma el Setup.

**No use el Client Tauri en clínica** (UI mDNS/huella; discovery stub). Solo experimental:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_client.ps1 -UseTauri
```

### Post-instalación Client

1. Instalar Setup en cada terminal (debe abrir **ConnectClinic**, con botones Buscar / Pegar URL / Reparar red — no la pantalla mDNS).
2. En el Server: Configuración → Equipos conectados → **Copiar** la URL recomendada (`http://IP:8001/`).
3. En el Client: **Pegar URL** o escribir esa IP y Conectar.
4. Atajos: Client (`--auto-connect`), Cambiar servidor (`--force-prompt`), Reparar red LAN.

---

## Build ambos

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_all.ps1
```

Equivale a Server completo + Client **NSIS ConnectClinic** (`-ForceNsis`).

Para clínica hoy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_server.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_client.ps1 -ForceNsis
```

---

## Limpieza / desinstalador total (zero residue)

| Artefacto | Ruta |
|-----------|------|
| EXE (recomendado) | `dist\NKDentalSoft-Clean-All-x64.exe` |
| Alias ES | `dist\NKDentalSoft-Desinstalador-Total-x64.exe` |
| BAT | `dist\Limpiar-Instalaciones-NKDentalSoft.bat` o `packaging\Limpiar-Instalaciones-NKDentalSoft.bat` |
| Log | Escritorio `\NKDentalSoft-limpia.log` |

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\build_cleaner.ps1
```

**Qué borra (todo):** Server + Client en rutas por defecto y custom (p. ej. `D:\NKDentalSoft`), `%ProgramData%\NKDentalSoft` (incluye base de datos), perfiles de todos los usuarios, atajos, firewall, servicios/tareas, Prefetch, claves `Uninstall` (Apps Windows 11) y `HKLM\Software\NKDentalSoft`. Archivos bloqueados se programan para borrar al reiniciar.

**Uso (como Administrador):**

1. Ejecutar `NKDentalSoft-Desinstalador-Total-x64.exe` (o `Clean-All`) y confirmar **dos veces**.
2. Revisar `NKDentalSoft-limpia.log` en el Escritorio (`SUCCESS: ZERO residue`).
3. Si quedan restos: reiniciar el PC y volver a ejecutar el desinstalador.
4. Instalar de nuevo Server y Client.

---

## Limpiar / desinstalar por completo (antes de reinstalar)

Si Client no conecta tras un upgrade o conviven restos de varias instalaciones, use el **limpiador total** (sección anterior).
5. Instalar `NKDentalSoft-Client-Setup-x64.exe` y pegar esa URL.

**Borra por completo:** `Program Files\NKDentalSoft`, `%ProgramData%\NKDentalSoft` (incluye SQLite), `%LocalAppData%\NKDentalSoft`, atajos, firewall, servicio/tarea y claves Uninstall.

---

## Conexiones congeladas

**Verificado 2026-07-27.** No modificar sin orden explícita del responsable del producto.

### Comportamiento estable (referencia, no “mejorar”)

| Pieza | Comportamiento |
|-------|----------------|
| Bind Server | `0.0.0.0:8001` |
| URL Client | `http://<IPv4>:8001/` solo con IP numérica |
| Preferencia IP | Ethernet real; filtrar VPN / APIPA / Hyper-V (`lan_network`) |
| Discovery | UDP beacon/responder puerto **37020** |
| Firewall | Puerto 8001 + EXE Server + ICMP vía `firewall_lan` / `repair_lan.ps1` |
| Aislamiento router | Guía Hotspot de clínica (`192.168.137.1` típico en Mobile Hotspot Windows) |
| UI Server | Panel Clients: copiar `recommended_url` |

### Archivos / carpetas bajo congelación

- `packaging/client/ConnectClinic.cs`
- `packaging/scripts/build_client_connector.ps1`
- `packaging/client/installer.nsi` (lanzamiento ConnectClinic / repair)
- `backend/app/services/lan_network.py`
- `backend/app/services/lan_discovery.py`
- `backend/app/services/firewall_lan.py`
- `backend/app/services/connect_card.py`
- `backend/app/routers/system.py` (parte connect-info / IPs LAN)
- `packaging/server/server_entry.py` (HOST / prepare_environment LAN)
- `packaging/server/scripts/repair_lan.ps1`
- `packaging/server/scripts/enable_clinic_hotspot.ps1`
- `packaging/server/Reparar-Red-LAN.bat`
- `packaging/server/Activar-Hotspot-Clinica.bat`

Regla Cursor (siempre activa): `.cursor/rules/lan-client-server-freeze.mdc`.

### Qué sí se puede hacer al empaquetar

- Regenerar instaladores con los scripts anteriores **sin editar** la lista congelada.
- Cambiar UI, módulos clínicos, PDFs, WhatsApp documentos, etc.
- Actualizar textos de este README si el pipeline de **build** cambia (PyInstaller/NSIS/Node), siempre que no se altere la red.

---

## Secretos y datos en PC Server

| Ruta | Contenido |
|------|-----------|
| `%ProgramData%\NKDentalSoft\config\.env` | Secretos clínica (no regenerar en upgrade) |
| `%ProgramData%\NKDentalSoft\data\` | SQLite / datos |
| `%ProgramData%\NKDentalSoft\logs\` | Logs |
| `%ProgramData%\NKDentalSoft\connect.url` / `IP-DEL-SERVIDOR.txt` | Tarjeta de conexión (IP actual) |

Generación manual (solo primera instalación / mantenimiento autorizado):

```powershell
python packaging/server/scripts/generate_production_secrets.py
```

Healthcheck:

```powershell
powershell -ExecutionPolicy Bypass -File packaging/server/scripts/post_install_healthcheck.ps1
```

---

## Iconos de marca

Fuente preferida: `C:\PROYECTOS\Recursos DentalSoft\Icono.png`

```powershell
python packaging\scripts\generate_icons.py
```

Salida: `packaging/client/icons/`, `packaging/server/assets/icons/`, favicons en `frontend/public/`.

---

## API de sistema (referencia)

| Endpoint | Uso |
|----------|-----|
| `GET /api/system/health` | Conectividad / post-install |
| `GET /api/system/version` | Versión |
| `GET /api/system/env-check` | ADMIN: secretos OK (sin filtrar valores) |
| Endpoints connect-info / LAN | **Congelados** — no rediseñar |

---

## Checklist rápido clínica

1. Server: Setup → arrancar → Configuración → **Copiar URL** (IP actual).
2. Misma LAN o Hotspot del Server; perfil de red **Privado**; sin VPN en Client.
3. Client: Setup → pegar URL → Conectar.
4. Topbar Client: **En línea**.

Si falla ping entre PCs: Hotspot de clínica o `Reparar-Red-LAN` como Admin en el Server — **sin cambiar código**.

---

## Fuera de alcance de este documento

Módulos clínicos, ACL, WhatsApp documentos (ver `.cursor/rules/document-whatsapp-sender.mdc`), y cualquier feature de producto no relacionada con empaquetado o LAN congelada.
