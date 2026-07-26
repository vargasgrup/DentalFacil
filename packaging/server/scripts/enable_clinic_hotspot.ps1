# Enable Windows Mobile Hotspot so Clients join the Server's own Wi-Fi
# (bypasses router AP/Client Isolation). Run as Administrator.
param([switch]$Quiet)

$ErrorActionPreference = "Continue"
$logDir = Join-Path $env:ProgramData "NKDentalSoft\logs"
$log = Join-Path $logDir "hotspot.log"
$card = Join-Path $env:ProgramData "NKDentalSoft\HOTSPOT.txt"

function Write-Hs([string]$m) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $m
  if (-not $Quiet) { Write-Host $line }
  try {
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
    Add-Content $log $line -Encoding UTF8
  } catch {}
}

Write-Hs "[hotspot] start — opening Windows Mobile Hotspot settings"
try {
  # Reliable path on Win10/11: open the Settings page (API varies by build)
  Start-Process "ms-settings:network-mobilehotspot"
} catch {
  Write-Hs "[hotspot] settings open failed: $($_.Exception.Message)"
}

$ssid = "NKDentalSoft-Clinica"
$pass = "DentalSoft1"
@"
N&K DentalSoft — Modo Hotspot de clinica (bypass del router)
============================================================
1) En el PC SERVER active: Configuracion → Red e Internet → Zona con cobertura movil
   (Mobile Hotspot). Comparta la conexion Ethernet.
2) Anote el nombre (SSID) y la contraseña que Windows muestre.
   Sugerido: SSID=$ssid  Clave=$pass (puede cambiarlos en Ajustes).
3) En cada PC CLIENT conecte el Wi-Fi a ESE hotspot (no al Wi-Fi de la clinica/casa).
4) En el Server abra N&K → Configuracion → Copiar la URL con IP
   (en hotspot Windows suele ser http://192.168.137.1:8001/).
5) En el Client: Pegar URL → Conectar.

Por que: muchos routers Wi-Fi bloquean PC↔PC (AP Isolation). El hotspot del Server
crea una red propia donde Client y Server si se ven.
"@ | Set-Content -Path $card -Encoding UTF8

Write-Hs "[hotspot] guide written → $card"
if (-not $Quiet) {
  Write-Host ""
  Write-Host "Se abrio Configuracion de Hotspot. Siga la guia en:"
  Write-Host "  $card"
  Write-Host ""
  try { notepad $card } catch {}
}
exit 0
