# Enable Windows Mobile Hotspot for clinic LAN Clients (bypass router AP isolation).
# ASCII-only for Windows PowerShell 5.1. Self-elevates. Leaves window open on success/fail.
#
# Run: Activar-Hotspot-Clinica.bat (Admin) or this script directly.

param(
  [switch]$Quiet,
  [switch]$NoElevate,
  [string]$Ssid = "NKDentalSoft-Clinica",
  [string]$Passphrase = "DentalSoft1"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$logDir = Join-Path $env:ProgramData "NKDentalSoft\logs"
$log = Join-Path $logDir "hotspot.log"
$card = Join-Path $env:ProgramData "NKDentalSoft\HOTSPOT.txt"
$script:Fail = 0

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Hs {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  if (-not $Quiet) { Write-Host $line }
  try {
    if (-not (Test-Path -LiteralPath $logDir)) {
      New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    }
    Add-Content -LiteralPath $log -Value $line -Encoding ASCII
  } catch {}
}

function Wait-Enter {
  if ($Quiet) { return }
  Write-Host ""
  Write-Host "Presione Enter para cerrar esta ventana..."
  try {
    [void][System.Console]::ReadLine()
  } catch {
    cmd /c pause >nul
  }
}

# Self-elevate (ArgumentList as array keeps spaces and & safe)
if (-not $NoElevate -and -not (Test-IsAdmin)) {
  Write-Host "Solicitando permisos de Administrador para Hotspot clinica..."
  $scriptPath = $MyInvocation.MyCommand.Path
  if (-not $scriptPath) { $scriptPath = $PSCommandPath }
  if (-not $scriptPath -or -not (Test-Path -LiteralPath $scriptPath)) {
    Write-Host "ERROR: no se pudo resolver la ruta del script."
    Wait-Enter
    exit 2
  }
  $argList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $scriptPath,
    "-NoElevate"
  )
  if ($Quiet) { $argList += "-Quiet" }
  if ($Ssid) { $argList += @("-Ssid", $Ssid) }
  if ($Passphrase) { $argList += @("-Passphrase", $Passphrase) }
  try {
    $p = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -Wait -PassThru
    exit $(if ($p) { $p.ExitCode } else { 0 })
  } catch {
    Write-Host ("ERROR: no se pudo elevar. " + $_.Exception.Message)
    Wait-Enter
    exit 2
  }
}

Write-Hs "=== Hotspot clinica START ==="
Write-Hs ("Admin=" + (Test-IsAdmin) + " User=" + $env:USERNAME)

# --- WinRT async await helper (PowerShell 5.1) ---
function Initialize-WinRtAwait {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
  $script:AsTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq "AsTask" -and
      $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
    })[0]
  if (-not $script:AsTaskGeneric) { throw "AsTask generic method not found" }
}

function Await-WinRt {
  param($WinRtTask, [Type]$ResultType)
  $asTask = $script:AsTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  if ($netTask.IsFaulted) { throw $netTask.Exception }
  return $netTask.Result
}

function Get-HotspotGatewayIp {
  $candidates = @()
  try {
    $candidates += Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -like "192.168.137.*" -or
        $_.InterfaceAlias -match "Local Area Connection\*|Wi-Fi Direct|Hotspot|Microsoft Hosted Network"
      } |
      Select-Object -ExpandProperty IPAddress
  } catch {}
  $candidates = @($candidates | Where-Object { $_ -and $_ -notlike "169.254.*" } | Select-Object -Unique)
  if ($candidates -contains "192.168.137.1") { return "192.168.137.1" }
  if ($candidates.Count -gt 0) { return $candidates[0] }
  return "192.168.137.1"
}

function Ensure-IcsService {
  Write-Hs "Ensuring Windows Mobile Hotspot Service (icssvc)..."
  try {
    Set-Service -Name "icssvc" -StartupType Automatic -ErrorAction SilentlyContinue
    $svc = Get-Service -Name "icssvc" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Running") {
      Start-Service -Name "icssvc" -ErrorAction Stop
      Start-Sleep -Seconds 2
    }
    $svc2 = Get-Service -Name "icssvc" -ErrorAction SilentlyContinue
    Write-Hs ("icssvc status=" + $(if ($svc2) { $svc2.Status } else { "missing" }))
  } catch {
    Write-Hs ("icssvc warn: " + $_.Exception.Message) "WARN"
  }
}

function Ensure-FirewallHotspot {
  Write-Hs "Firewall rules for TCP 8001 / UDP 37020..."
  $rules = @(
    @{ Name = "NKDentalSoft Server 8001"; Proto = "TCP"; Port = "8001" },
    @{ Name = "NKDentalSoft LAN Discovery 37020"; Proto = "UDP"; Port = "37020" }
  )
  foreach ($r in $rules) {
    try {
      netsh advfirewall firewall delete rule name="$($r.Name)" | Out-Null
      netsh advfirewall firewall add rule name="$($r.Name)" dir=in action=allow protocol=$($r.Proto) localport=$($r.Port) profile=any edge=yes enable=yes | Out-Null
      Write-Hs ("firewall OK " + $r.Name)
    } catch {
      Write-Hs ("firewall warn " + $r.Name + ": " + $_.Exception.Message) "WARN"
    }
  }
}

function Start-MobileHotspot {
  Initialize-WinRtAwait

  $null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]
  $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime]

  $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if ($null -eq $profile) {
    throw "No hay perfil de Internet activo. Conecte el Server a Ethernet (o Wi-Fi con Internet) y reintente."
  }
  Write-Hs ("Internet profile: " + $profile.ProfileName)

  $mgr = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
  if ($null -eq $mgr) {
    throw "No se pudo crear NetworkOperatorTetheringManager (adaptador Wi-Fi no soporta Mobile Hotspot)."
  }

  Write-Hs ("TetheringOperationalState before=" + $mgr.TetheringOperationalState)

  # Configure SSID / password when possible
  try {
    $cfg = $mgr.GetCurrentAccessPointConfiguration()
    if ($cfg) {
      if ($Ssid) { $cfg.Ssid = $Ssid }
      if ($Passphrase -and $Passphrase.Length -ge 8) { $cfg.Passphrase = $Passphrase }
      Write-Hs ("ConfigureAccessPointAsync SSID=" + $cfg.Ssid)
      # Fire configure; do not block on result type differences across Windows builds
      $null = $mgr.ConfigureAccessPointAsync($cfg)
      Start-Sleep -Seconds 1
      Write-Hs "ConfigureAccessPointAsync submitted"
    }
  } catch {
    Write-Hs ("ConfigureAccessPoint skipped: " + $_.Exception.Message) "WARN"
  }

  # If already on, leave it; else start
  $state = [string]$mgr.TetheringOperationalState
  if ($state -match "On|1") {
    Write-Hs "Hotspot already ON"
  } else {
    Write-Hs "StartTetheringAsync..."
    try {
      $startResult = Await-WinRt -WinRtTask ($mgr.StartTetheringAsync()) -ResultType ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
      Write-Hs ("StartTethering Status=" + $startResult.Status + " Error=" + $startResult.AdditionalErrorCode)
      if ([string]$startResult.Status -notmatch "Success|0") {
        throw ("StartTethering failed: " + $startResult.Status + " code=" + $startResult.AdditionalErrorCode)
      }
    } catch {
      # Fallback: fire-and-forget then poll (some PS hosts mishandle Result type)
      Write-Hs ("Await typed failed, retry fire-and-forget: " + $_.Exception.Message) "WARN"
      $null = $mgr.StartTetheringAsync()
      $ok = $false
      for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $st = [string]$mgr.TetheringOperationalState
        Write-Hs ("poll state=" + $st)
        if ($st -match "On|1") { $ok = $true; break }
      }
      if (-not $ok) { throw "Hotspot no paso a estado On tras StartTetheringAsync." }
    }
  }

  Start-Sleep -Seconds 2
  Write-Hs ("TetheringOperationalState after=" + $mgr.TetheringOperationalState)

  $ssidNow = $Ssid
  $passNow = $Passphrase
  try {
    $cfg2 = $mgr.GetCurrentAccessPointConfiguration()
    if ($cfg2) {
      if ($cfg2.Ssid) { $ssidNow = $cfg2.Ssid }
      if ($cfg2.Passphrase) { $passNow = $cfg2.Passphrase }
    }
  } catch {}

  return @{
    Ssid = $ssidNow
    Passphrase = $passNow
    State = [string]$mgr.TetheringOperationalState
  }
}

# ========== MAIN ==========
Ensure-IcsService
Ensure-FirewallHotspot

$hot = $null
try {
  $hot = Start-MobileHotspot
  Write-Hs ("Hotspot OK state=" + $hot.State + " SSID=" + $hot.Ssid)
} catch {
  $script:Fail = 1
  Write-Hs ("Hotspot API failed: " + $_.Exception.Message) "ERROR"
  Write-Hs "Opening Windows Settings as fallback..."
  try { Start-Process "ms-settings:network-mobilehotspot" } catch {}
}

$gw = Get-HotspotGatewayIp
$clientUrl = "http://{0}:8001/" -f $gw
Write-Hs ("Gateway IP for Clients=" + $gw)

$guide = @"
N&K DentalSoft - Modo Hotspot de clinica
========================================
Fecha: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Log: $log

SSID (Wi-Fi del Server): $($hot.Ssid)
Clave: $($hot.Passphrase)
URL para Clients: $clientUrl

Pasos en cada PC CLIENT:
1) Conecte el Wi-Fi al SSID de arriba (NO al Wi-Fi del router de la clinica).
2) Abra N&K DentalSoft Client.
3) Pegue la URL: $clientUrl
4) Pulse Conectar.

Si el Hotspot no encendio solo:
- Abra Configuracion Windows > Red e Internet > Zona con cobertura movil
- Active el interruptor y comparta Ethernet.
- Luego vuelva a ejecutar este asistente.

Por que: muchos routers bloquean PC<->PC (AP Isolation). El hotspot del Server
crea una red propia donde Client y Server si se ven.
"@

try {
  if (-not (Test-Path -LiteralPath (Split-Path $card -Parent))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $card -Parent) | Out-Null
  }
  Set-Content -LiteralPath $card -Value $guide -Encoding ASCII
  Write-Hs ("Guide written " + $card)
} catch {
  Write-Hs ("Guide write failed: " + $_.Exception.Message) "WARN"
}

if (-not $Quiet) {
  Write-Host ""
  Write-Host "============================================================"
  if ($script:Fail -eq 0) {
    Write-Host " HOTSPOT CLINICA LISTO"
  } else {
    Write-Host " HOTSPOT: revise Ajustes de Windows (API fallo)"
  }
  Write-Host "============================================================"
  Write-Host (" SSID : " + $(if ($hot) { $hot.Ssid } else { $Ssid }))
  Write-Host (" Clave: " + $(if ($hot) { $hot.Passphrase } else { $Passphrase }))
  Write-Host (" URL  : " + $clientUrl)
  Write-Host " Guia : $card"
  Write-Host " Log  : $log"
  Write-Host "============================================================"
  try { Start-Process notepad.exe $card } catch {}
}

Wait-Enter
exit $script:Fail
