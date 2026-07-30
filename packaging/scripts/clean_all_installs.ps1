# Full uninstall / wipe of N&K DentalSoft (Server + Client) leftovers.
# ASCII-only for Windows PowerShell 5.1. Self-elevates if needed.
# Always wipes Program Files, ProgramData, LocalAppData client data,
# shortcuts, firewall rules, services and scheduled tasks.
#
# Log: %USERPROFILE%\Desktop\NKDentalSoft-limpia.log
#      (or %TEMP% if Desktop not writable)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File clean_all_installs.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File clean_all_installs.ps1 -NoElevate

param(
  [switch]$NoElevate,
  [switch]$WhatIf
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-LogPath {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if ($desktop -and (Test-Path -LiteralPath $desktop)) {
    return (Join-Path $desktop "NKDentalSoft-limpia.log")
  }
  return (Join-Path $env:TEMP "NKDentalSoft-limpia.log")
}

$script:LogPath = Get-LogPath
$script:FailCount = 0
$script:OkCount = 0

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  try {
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding ASCII -ErrorAction SilentlyContinue
  } catch {}
}

# Self-elevate (do NOT use #Requires - it aborts with no UI when not admin)
if (-not $NoElevate -and -not (Test-IsAdmin)) {
  Write-Host "Solicitando permisos de Administrador..."
  $argList = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ("`"{0}`"" -f $MyInvocation.MyCommand.Path),
    "-NoElevate"
  )
  if ($WhatIf) { $argList += "-WhatIf" }
  try {
    $p = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList ($argList -join " ") -Wait -PassThru
    exit $p.ExitCode
  } catch {
    Write-Host ("ERROR: no se pudo elevar. Ejecute como Administrador. " + $_.Exception.Message)
    exit 2
  }
}

try {
  Set-Content -LiteralPath $script:LogPath -Value ("NKDentalSoft full clean started " + (Get-Date -Format "s")) -Encoding ASCII
} catch {}

Write-Log ("Admin=" + (Test-IsAdmin) + " WhatIf=" + [bool]$WhatIf)
Write-Log ("Log=" + $script:LogPath)
Write-Log "FULL WIPE: Program Files + ProgramData + LocalAppData + firewall + tasks"

function Invoke-Step {
  param([string]$Label, [scriptblock]$Action)
  if ($WhatIf) {
    Write-Log ("WHATIF " + $Label)
    return
  }
  try {
    & $Action
    $script:OkCount++
    Write-Log ("OK  " + $Label)
  } catch {
    $script:FailCount++
    Write-Log ("FAIL " + $Label + " :: " + $_.Exception.Message) "WARN"
  }
}

function Stop-NamedProcesses {
  param([string[]]$Names)
  foreach ($n in $Names) {
    Invoke-Step -Label ("taskkill " + $n) -Action {
      Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      cmd.exe /c ("taskkill /F /IM {0}.exe /T >nul 2>&1" -f $n) | Out-Null
      Start-Sleep -Milliseconds 200
    }
  }
}

function Clear-TcpPort {
  param([int]$Port)
  Invoke-Step -Label ("free TCP " + $Port) -Action {
    try {
      $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    } catch { $conns = @() }
    foreach ($c in $conns) {
      if ($c.OwningProcess -gt 4) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        cmd.exe /c ("taskkill /F /PID {0} /T >nul 2>&1" -f $c.OwningProcess) | Out-Null
      }
    }
  }
}

function Remove-TreeForce {
  param([string]$Path)
  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Log ("skip missing " + $Path)
    return
  }

  Invoke-Step -Label ("remove " + $Path) -Action {
    # Unlock common attributes
    cmd.exe /c ("attrib -R -S -H `"{0}\*`" /S /D >nul 2>&1" -f $Path) | Out-Null

    # Take ownership (Admin) then grant full control
    cmd.exe /c ("takeown /F `"{0}`" /R /D Y >nul 2>&1" -f $Path) | Out-Null
    cmd.exe /c ("icacls `"{0}`" /grant Administrators:F /T /C /Q >nul 2>&1" -f $Path) | Out-Null
    cmd.exe /c ("icacls `"{0}`" /grant *S-1-5-32-544:F /T /C /Q >nul 2>&1" -f $Path) | Out-Null

    # PowerShell delete
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue

    # cmd rd fallback
    if (Test-Path -LiteralPath $Path) {
      cmd.exe /c ("rd /s /q `"{0}`"" -f $Path) | Out-Null
    }
    if (Test-Path -LiteralPath $Path) {
      # Rename locked leftovers then delete on next reboot hint
      $dead = $Path + ".old_" + (Get-Date -Format "yyyyMMddHHmmss")
      Rename-Item -LiteralPath $Path -NewName (Split-Path $dead -Leaf) -ErrorAction SilentlyContinue
      if (Test-Path -LiteralPath $Path) {
        throw "still locked after takeown/rd"
      }
      if (Test-Path -LiteralPath $dead) {
        cmd.exe /c ("rd /s /q `"{0}`"" -f $dead) | Out-Null
      }
    }
  }
}

function Remove-FileForce {
  param([string]$Path)
  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Invoke-Step -Label ("delete file " + $Path) -Action {
    cmd.exe /c ("attrib -R -S -H `"{0}`" >nul 2>&1" -f $Path) | Out-Null
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $Path) {
      cmd.exe /c ("del /f /q `"{0}`"" -f $Path) | Out-Null
    }
    if (Test-Path -LiteralPath $Path) { throw "file locked" }
  }
}

# ========== 1) STOP ==========
Write-Log "STEP 1 stop processes"
$procNames = @(
  "nkdentalsoft-server",
  "ConnectClinic",
  "nkdentalsoft-client",
  "nkdentalsoft-client-portables"
)
Stop-NamedProcesses -Names $procNames

$stopScript = Join-Path $env:ProgramFiles "NKDentalSoft\Server\scripts\stop_for_upgrade.ps1"
if (Test-Path -LiteralPath $stopScript) {
  Invoke-Step -Label "stop_for_upgrade.ps1" -Action {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
  }
}

$serverExe = Join-Path $env:ProgramFiles "NKDentalSoft\Server\nkdentalsoft-server.exe"
if (Test-Path -LiteralPath $serverExe) {
  Invoke-Step -Label "server.exe stop/remove" -Action {
    & $serverExe stop 2>$null | Out-Null
    & $serverExe remove 2>$null | Out-Null
  }
}

Clear-TcpPort -Port 8001
Clear-TcpPort -Port 37020

# ========== 2) SERVICE / TASK ==========
Write-Log "STEP 2 service and task"
Invoke-Step -Label "sc stop/delete NKDentalSoftServer" -Action {
  sc.exe stop NKDentalSoftServer 2>$null | Out-Null
  Start-Sleep -Milliseconds 400
  sc.exe delete NKDentalSoftServer 2>$null | Out-Null
}
Invoke-Step -Label "schtasks delete NKDentalSoft Server" -Action {
  schtasks.exe /Delete /TN "NKDentalSoft Server" /F 2>$null | Out-Null
}

# ========== 3) Official uninstallers ==========
Write-Log "STEP 3 official Uninstall.exe"
$uninstallers = @(
  (Join-Path $env:ProgramFiles "NKDentalSoft\Server\Uninstall.exe"),
  (Join-Path $env:ProgramFiles "NKDentalSoft\Client\Uninstall.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Server\Uninstall.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Client\Uninstall.exe")
)
foreach ($u in $uninstallers) {
  if (Test-Path -LiteralPath $u) {
    Invoke-Step -Label ("Uninstall.exe /S " + $u) -Action {
      $p = Start-Process -FilePath $u -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
      Start-Sleep -Seconds 2
      if ($null -eq $p) { throw "uninstall did not start" }
    }
    # Re-kill in case uninstaller restarted nothing; continue wipe anyway
    Stop-NamedProcesses -Names $procNames
  }
}

# ========== 4) PROGRAM FILES ==========
Write-Log "STEP 4 Program Files trees"
$programRoots = @(
  (Join-Path $env:ProgramFiles "NKDentalSoft"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft")
)
foreach ($root in $programRoots) {
  Remove-TreeForce -Path $root
}

# Tauri / alternate
foreach ($p in @(
    (Join-Path $env:LOCALAPPDATA "N&K DentalSoft"),
    (Join-Path $env:LOCALAPPDATA "com.mdodontologia.nkdentalsoft"),
    (Join-Path $env:APPDATA "com.mdodontologia.nkdentalsoft"),
    (Join-Path $env:LOCALAPPDATA "nkdentalsoft-client")
  )) {
  Remove-TreeForce -Path $p
}

# ========== 5) PROGRAMDATA + LOCALAPPDATA (FULL) ==========
Write-Log "STEP 5 ProgramData and LocalAppData FULL wipe"
Remove-TreeForce -Path (Join-Path $env:ProgramData "NKDentalSoft")
Remove-TreeForce -Path (Join-Path $env:LOCALAPPDATA "NKDentalSoft")
# Other users LocalAppData (best effort)
$usersRoot = Join-Path $env:SystemDrive "Users"
if (Test-Path -LiteralPath $usersRoot) {
  Get-ChildItem -LiteralPath $usersRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $other = Join-Path $_.FullName "AppData\Local\NKDentalSoft"
    if (Test-Path -LiteralPath $other) {
      Remove-TreeForce -Path $other
    }
  }
}

# ========== 6) SHORTCUTS ==========
Write-Log "STEP 6 shortcuts"
$shortcutDirs = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

foreach ($dir in $shortcutDirs) {
  foreach ($pat in @("*DentalSoft*","*NKDental*","*ConnectClinic*","*Hotspot clinica*","*Reparar red LAN*")) {
    Get-ChildItem -LiteralPath $dir -Filter $pat -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      # Never delete our own log file
      if ($_.FullName -eq $script:LogPath) { return }
      if ($_.Name -eq "NKDentalSoft-limpia.log") { return }
      Remove-FileForce -Path $_.FullName
    }
  }
  Remove-TreeForce -Path (Join-Path $dir "N&K DentalSoft")
}

# ========== 7) FIREWALL ==========
Write-Log "STEP 7 firewall"
$fwKnown = @(
  "NKDentalSoft Server 8001",
  "NKDentalSoft LAN Discovery 37020",
  "NKDentalSoft Server EXE",
  "NKDentalSoft Server EXE Out",
  "NKDentalSoft ICMP Allow",
  "nkdentalsoft-server"
)
foreach ($rule in $fwKnown) {
  Invoke-Step -Label ("firewall delete " + $rule) -Action {
    netsh advfirewall firewall delete rule name="$rule" | Out-Null
  }
}
Invoke-Step -Label "firewall scan NKDentalSoft*" -Action {
  $names = netsh advfirewall firewall show rule name=all |
    Select-String -Pattern 'Rule Name:\s*(.+)$' |
    ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() } |
    Where-Object { $_ -match 'NKDental|nkdental|DentalSoft' } |
    Select-Object -Unique
  foreach ($name in $names) {
    netsh advfirewall firewall delete rule name="$name" | Out-Null
    Write-Log ("OK  firewall delete " + $name)
  }
}

# ========== 8) REGISTRY ==========
Write-Log "STEP 8 registry uninstall keys"
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
      Invoke-Step -Label ("reg delete " + $dn) -Action {
        Remove-Item -LiteralPath $keyPath -Recurse -Force -ErrorAction Stop
      }
    }
  }
}

# Run keys
foreach ($runKey in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
  )) {
  if (-not (Test-Path -LiteralPath $runKey)) { continue }
  $props = Get-ItemProperty -LiteralPath $runKey -ErrorAction SilentlyContinue
  if (-not $props) { continue }
  $props.PSObject.Properties | Where-Object {
    $_.Name -notmatch '^PS' -and ([string]$_.Value -match 'NKDentalSoft|nkdentalsoft|ConnectClinic|N&K DentalSoft')
  } | ForEach-Object {
    $name = $_.Name
    Invoke-Step -Label ("Run key remove " + $name) -Action {
      Remove-ItemProperty -LiteralPath $runKey -Name $name -Force -ErrorAction Stop
    }
  }
}

# ========== 9) VERIFY ==========
Write-Log "STEP 9 verify"
$left = @()
foreach ($p in @(
    (Join-Path $env:ProgramFiles "NKDentalSoft"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft"),
    (Join-Path $env:ProgramData "NKDentalSoft"),
    (Join-Path $env:LOCALAPPDATA "NKDentalSoft")
  )) {
  if (Test-Path -LiteralPath $p) { $left += $p }
}
foreach ($n in $procNames) {
  if (Get-Process -Name $n -ErrorAction SilentlyContinue) {
    $left += ("process:" + $n)
  }
}

Write-Log ("Done. ok=" + $script:OkCount + " fail=" + $script:FailCount)
if ($left.Count -eq 0) {
  Write-Log "SUCCESS: no NKDentalSoft leftovers found."
  Write-Host ""
  Write-Host "Limpieza TOTAL OK. Ya puede instalar Server y Client de nuevo."
  Write-Host ("Log: " + $script:LogPath)
  exit 0
}

Write-Log "INCOMPLETE leftovers:" "WARN"
foreach ($p in $left) { Write-Log ("  LEFT " + $p) "WARN" }
Write-Host ""
Write-Host "Quedaron restos (archivo en uso). REINICIE el PC y vuelva a ejecutar el limpiador."
Write-Host ("Log: " + $script:LogPath)
exit 1
