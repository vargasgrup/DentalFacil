# Clean all prior N&K DentalSoft Server + Client installs on this PC.
# Use before a fresh Setup so stale EXEs, URLs, tasks and firewall rules
# cannot conflict with a new install.
#
# ASCII-only (Windows PowerShell 5.1). Run elevated.
#
# Default: removes programs, shortcuts, client URL, firewall rules, tasks.
# Keeps clinic SQLite / .env under ProgramData (use -WipeClinicData to erase).
#
# Examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\clean_all_installs.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\clean_all_installs.ps1 -WipeClinicData
#   powershell -NoProfile -ExecutionPolicy Bypass -File packaging\scripts\clean_all_installs.ps1 -WhatIf

#Requires -RunAsAdministrator
param(
  [switch]$WipeClinicData,
  [switch]$WhatIf,
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Write-Step {
  param([string]$Message)
  if (-not $Quiet) { Write-Host $Message }
}

function Invoke-Safe {
  param([scriptblock]$Action, [string]$Label)
  try {
    if ($WhatIf) {
      Write-Step "[whatif] $Label"
      return
    }
    & $Action
    Write-Step "[ok] $Label"
  } catch {
    Write-Step "[warn] $Label :: $($_.Exception.Message)"
  }
}

function Remove-PathSafe {
  param([string]$Path, [string]$Label)
  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Step "[skip] missing $Path"
    return
  }
  Invoke-Safe -Label ($Label + ": " + $Path) -Action {
    if (Test-Path -LiteralPath $Path -PathType Container) {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    } else {
      Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    }
  }
}

Write-Step "==> N&K DentalSoft — limpia instalaciones anteriores"
Write-Step ("    WipeClinicData=" + [bool]$WipeClinicData + "  WhatIf=" + [bool]$WhatIf)
Write-Step ""

# --- 1) Stop processes / free port 8001 ---
Write-Step "==> Detener procesos"
$procNames = @(
  "nkdentalsoft-server",
  "ConnectClinic",
  "nkdentalsoft-client",
  "nkdentalsoft-client-portables"
)
foreach ($n in $procNames) {
  Invoke-Safe -Label "Stop process $n" -Action {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    cmd /c ("taskkill /F /IM {0}.exe /T >nul 2>&1" -f $n) | Out-Null
  }
}

$stopScript = Join-Path ${env:ProgramFiles} "NKDentalSoft\Server\scripts\stop_for_upgrade.ps1"
if (Test-Path -LiteralPath $stopScript) {
  Invoke-Safe -Label "stop_for_upgrade.ps1" -Action {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
  }
}

Invoke-Safe -Label "Free listeners on TCP 8001" -Action {
  try {
    $conns = @(Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue)
  } catch { $conns = @() }
  foreach ($c in $conns) {
    if ($c.OwningProcess -gt 0) {
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

# --- 2) Windows service + scheduled task ---
Write-Step "==> Servicio y tarea programada"
Invoke-Safe -Label "sc stop/delete NKDentalSoftServer" -Action {
  sc.exe stop NKDentalSoftServer 2>$null | Out-Null
  sc.exe delete NKDentalSoftServer 2>$null | Out-Null
}
Invoke-Safe -Label 'schtasks delete "NKDentalSoft Server"' -Action {
  schtasks.exe /Delete /TN "NKDentalSoft Server" /F 2>$null | Out-Null
}

$serverExe = Join-Path ${env:ProgramFiles} "NKDentalSoft\Server\nkdentalsoft-server.exe"
if (Test-Path -LiteralPath $serverExe) {
  Invoke-Safe -Label "server.exe stop/remove" -Action {
    & $serverExe stop 2>$null | Out-Null
    & $serverExe remove 2>$null | Out-Null
  }
}

# --- 3) Official uninstallers (best-effort, silent) ---
Write-Step "==> Desinstaladores oficiales (si existen)"
$officialUninstallers = @(
  (Join-Path ${env:ProgramFiles} "NKDentalSoft\Server\Uninstall.exe"),
  (Join-Path ${env:ProgramFiles} "NKDentalSoft\Client\Uninstall.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Server\Uninstall.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Client\Uninstall.exe")
)
foreach ($u in $officialUninstallers) {
  if (Test-Path -LiteralPath $u) {
    Invoke-Safe -Label "Run $u /S" -Action {
      $p = Start-Process -FilePath $u -ArgumentList "/S" -Wait -PassThru -ErrorAction SilentlyContinue
      if ($null -eq $p) { throw "no process" }
    }
  }
}

# --- 4) Program Files trees ---
Write-Step "==> Carpetas de programa"
$programRoots = @(
  (Join-Path ${env:ProgramFiles} "NKDentalSoft"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft")
)
foreach ($root in $programRoots) {
  Remove-PathSafe -Path $root -Label "Remove Program Files tree"
}

# Tauri / alternate client locations
$altInstalls = @(
  (Join-Path $env:LOCALAPPDATA "N&K DentalSoft"),
  (Join-Path $env:LOCALAPPDATA "com.mdodontologia.nkdentalsoft"),
  (Join-Path $env:APPDATA "com.mdodontologia.nkdentalsoft"),
  (Join-Path $env:LOCALAPPDATA "nkdentalsoft-client")
)
foreach ($p in $altInstalls) {
  Remove-PathSafe -Path $p -Label "Remove alternate client install"
}

# --- 5) Shortcuts ---
Write-Step "==> Accesos directos"
$shortcutDirs = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$shortcutPatterns = @(
  "*DentalSoft*",
  "*NKDental*",
  "*ConnectClinic*",
  "*Hotspot clinica*",
  "*Reparar red LAN*"
)

foreach ($dir in $shortcutDirs) {
  foreach ($pat in $shortcutPatterns) {
    Get-ChildItem -LiteralPath $dir -Filter $pat -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object {
        Remove-PathSafe -Path $_.FullName -Label "Remove shortcut"
      }
  }
  $startFolder = Join-Path $dir "N&K DentalSoft"
  Remove-PathSafe -Path $startFolder -Label "Remove Start Menu folder"
}

# --- 6) Client config (stale server URL is a common connect failure) ---
Write-Step "==> Config del Cliente (URL guardada)"
$clientCfg = Join-Path $env:LOCALAPPDATA "NKDentalSoft"
if (Test-Path -LiteralPath $clientCfg) {
  if ($WipeClinicData) {
    Remove-PathSafe -Path $clientCfg -Label "Remove LOCALAPPDATA\NKDentalSoft"
  } else {
    foreach ($f in @("client-url.txt", "client.log", "connect.url")) {
      Remove-PathSafe -Path (Join-Path $clientCfg $f) -Label "Remove client config file"
    }
    # If folder empty (or only leftovers), remove it
    Invoke-Safe -Label "Prune empty LOCALAPPDATA\NKDentalSoft" -Action {
      $left = @(Get-ChildItem -LiteralPath $clientCfg -Force -ErrorAction SilentlyContinue)
      if ($left.Count -eq 0) {
        Remove-Item -LiteralPath $clientCfg -Force -ErrorAction Stop
      }
    }
  }
}

# --- 7) ProgramData (clinic data optional) ---
Write-Step "==> ProgramData"
$pd = Join-Path $env:ProgramData "NKDentalSoft"
if (Test-Path -LiteralPath $pd) {
  if ($WipeClinicData) {
    Remove-PathSafe -Path $pd -Label "WIPE ProgramData\NKDentalSoft (datos clinica)"
  } else {
    # Connection leftovers that can point Clients to a dead IP
    foreach ($rel in @(
        "connect.url",
        "IP-DEL-SERVIDOR.txt",
        "HOTSPOT.txt",
        "logs\install_autostart.log",
        "logs\startup.log",
        "logs\client.log"
      )) {
      Remove-PathSafe -Path (Join-Path $pd $rel) -Label "Remove ProgramData leftover"
    }
    Write-Step "[keep] ProgramData\NKDentalSoft\data y config\.env (use -WipeClinicData para borrar)"
  }
}

# --- 8) Firewall rules ---
Write-Step "==> Reglas de firewall"
$fwRules = @(
  "NKDentalSoft Server 8001",
  "NKDentalSoft LAN Discovery 37020",
  "NKDentalSoft Server EXE",
  "NKDentalSoft Server EXE Out",
  "NKDentalSoft ICMP Allow",
  "nkdentalsoft-server"
)
foreach ($rule in $fwRules) {
  Invoke-Safe -Label ("firewall delete: " + $rule) -Action {
    netsh advfirewall firewall delete rule name="$rule" | Out-Null
  }
}
Invoke-Safe -Label "firewall delete rules matching NKDentalSoft*" -Action {
  $lines = netsh advfirewall firewall show rule name=all |
    Select-String -Pattern '^\s*Rule Name:\s*(.+)$' |
    ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() } |
    Where-Object { $_ -match 'NKDental|nkdental|DentalSoft' } |
    Select-Object -Unique
  foreach ($name in $lines) {
    netsh advfirewall firewall delete rule name="$name" | Out-Null
    Write-Step ("[ok] firewall delete: " + $name)
  }
}

# --- 9) Registry uninstall leftovers (NSIS / Tauri) ---
Write-Step "==> Registro (Uninstall)"
$uninstRoots = @(
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
)
foreach ($root in $uninstRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
    $keyPath = $_.PSPath
    $props = Get-ItemProperty -LiteralPath $keyPath -ErrorAction SilentlyContinue
    $dn = [string]$props.DisplayName
    if ($dn -and ($dn -match 'N&K DentalSoft|NKDentalSoft|nkdentalsoft|mdodontologia')) {
      Invoke-Safe -Label ("Remove uninstall key: " + $dn) -Action {
        Remove-Item -LiteralPath $keyPath -Recurse -Force -ErrorAction Stop
      }
    }
  }
}

# --- 10) Final process sweep ---
Write-Step "==> Verificacion final"
foreach ($n in $procNames) {
  $still = @(Get-Process -Name $n -ErrorAction SilentlyContinue)
  if ($still.Count -gt 0) {
    Write-Step ("[warn] aun corre: " + $n + " (pids " + (($still | ForEach-Object Id) -join ",") + ")")
  }
}

$pfLeft = @(
  (Join-Path ${env:ProgramFiles} "NKDentalSoft"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft")
) | Where-Object { Test-Path -LiteralPath $_ }

if ($pfLeft.Count -eq 0) {
  Write-Step ""
  Write-Step "==> Limpieza completada. Ya puede instalar Server y/o Client de nuevo."
  Write-Step "    Server: dist\NKDentalSoft-Server-Setup-x64.exe"
  Write-Step "    Client: dist\NKDentalSoft-Client-Setup-x64.exe"
  if (-not $WipeClinicData) {
    Write-Step "    Nota: se conservaron datos de clinica en %ProgramData%\NKDentalSoft"
  }
  exit 0
}

Write-Step ""
Write-Step "[warn] Quedaron carpetas (posible archivo en uso). Reinicie el PC y vuelva a ejecutar:"
foreach ($p in $pfLeft) { Write-Step ("    " + $p) }
exit 1
