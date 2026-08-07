# Full uninstall / wipe of N&K DentalSoft — ZERO residues.
# Server + Client + clinical ProgramData + registry + firewall + tasks + shortcuts.
# ASCII-only (Windows PowerShell 5.1). Self-elevates if needed.
#
# Log: %USERPROFILE%\Desktop\NKDentalSoft-limpia.log (or %TEMP%)
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
$script:TargetDirs = New-Object System.Collections.Generic.List[string]
$script:PendingReboot = $false

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  try {
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding ASCII -ErrorAction SilentlyContinue
  } catch {}
}

function Add-TargetDir {
  param([string]$Path)
  if (-not $Path) { return }
  $t = $Path.TrimEnd('\', '/')
  if (-not $t) { return }
  if (-not $script:TargetDirs.Contains($t)) {
    $script:TargetDirs.Add($t) | Out-Null
  }
}

# Self-elevate
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
  Set-Content -LiteralPath $script:LogPath -Value ("NKDentalSoft TOTAL WIPE started " + (Get-Date -Format "s")) -Encoding ASCII
} catch {}

Write-Log ("Admin=" + (Test-IsAdmin) + " WhatIf=" + [bool]$WhatIf)
Write-Log ("Log=" + $script:LogPath)
Write-Log "MODE=TOTAL ZERO RESIDUE (files + data + registry + firewall + tasks)"

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
      Start-Sleep -Milliseconds 250
    }
  }
  # By path / window
  Invoke-Step -Label "taskkill path match NKDental/ConnectClinic" -Action {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $cmd = [string]$_.CommandLine
        $exe = [string]$_.ExecutablePath
        ($cmd -match 'NKDentalSoft|ConnectClinic|nkdentalsoft') -or
        ($exe -match 'NKDentalSoft|ConnectClinic|nkdentalsoft')
      } |
      ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        cmd.exe /c ("taskkill /F /PID {0} /T >nul 2>&1" -f $_.ProcessId) | Out-Null
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

function Request-DeleteOnReboot {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return }
  try {
    $sig = @'
[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, int dwFlags);
'@
    $type = Add-Type -MemberDefinition $sig -Name NativeMethodsMoveEx -Namespace Win32 -PassThru -ErrorAction SilentlyContinue
    if (-not $type) {
      $type = [Win32.NativeMethodsMoveEx]
    }
    $MOVEFILE_DELAY_UNTIL_REBOOT = 4
    if (Test-Path -LiteralPath $Path -PathType Container) {
      Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
        Sort-Object { $_.FullName.Length } -Descending |
        ForEach-Object {
          [void]$type::MoveFileEx($_.FullName, $null, $MOVEFILE_DELAY_UNTIL_REBOOT)
        }
    }
    [void]$type::MoveFileEx($Path, $null, $MOVEFILE_DELAY_UNTIL_REBOOT)
    $script:PendingReboot = $true
    Write-Log ("pending reboot delete: " + $Path) "WARN"
  } catch {
    Write-Log ("MoveFileEx fail " + $Path + " :: " + $_.Exception.Message) "WARN"
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
    cmd.exe /c ("attrib -R -S -H `"{0}\*`" /S /D >nul 2>&1" -f $Path) | Out-Null
    cmd.exe /c ("takeown /F `"{0}`" /R /D Y >nul 2>&1" -f $Path) | Out-Null
    cmd.exe /c ("icacls `"{0}`" /grant Administrators:F /T /C /Q >nul 2>&1" -f $Path) | Out-Null
    cmd.exe /c ("icacls `"{0}`" /grant *S-1-5-32-544:F /T /C /Q >nul 2>&1" -f $Path) | Out-Null
    cmd.exe /c ("icacls `"{0}`" /grant SYSTEM:F /T /C /Q >nul 2>&1" -f $Path) | Out-Null

    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue

    if (Test-Path -LiteralPath $Path) {
      cmd.exe /c ("rd /s /q `"{0}`"" -f $Path) | Out-Null
    }
    if (Test-Path -LiteralPath $Path) {
      $dead = $Path + ".old_" + (Get-Date -Format "yyyyMMddHHmmss")
      try {
        Rename-Item -LiteralPath $Path -NewName (Split-Path $dead -Leaf) -ErrorAction Stop
        if (Test-Path -LiteralPath $dead) {
          cmd.exe /c ("rd /s /q `"{0}`"" -f $dead) | Out-Null
        }
      } catch {}
    }
    if (Test-Path -LiteralPath $Path) {
      Request-DeleteOnReboot -Path $Path
      throw "still present (scheduled for reboot delete if locked)"
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
    if (Test-Path -LiteralPath $Path) {
      Request-DeleteOnReboot -Path $Path
      throw "file locked (pending reboot)"
    }
  }
}

function Get-RegInstallDirs {
  $paths = @()
  $keys = @(
    "HKLM:\Software\NKDentalSoft\Server",
    "HKLM:\Software\NKDentalSoft\Client",
    "HKLM:\Software\WOW6432Node\NKDentalSoft\Server",
    "HKLM:\Software\WOW6432Node\NKDentalSoft\Client",
    "HKCU:\Software\NKDentalSoft\Server",
    "HKCU:\Software\NKDentalSoft\Client"
  )
  foreach ($k in $keys) {
    if (-not (Test-Path -LiteralPath $k)) { continue }
    try {
      $p = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop).InstallDir
      if ($p) { $paths += [string]$p }
    } catch {}
  }
  $uninstRoots = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  )
  foreach ($root in $uninstRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
      $props = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
      $dn = [string]$props.DisplayName
      if ($dn -and ($dn -match 'N&K DentalSoft|NKDentalSoft|nkdentalsoft|mdodontologia')) {
        if ($props.InstallLocation) { $paths += [string]$props.InstallLocation }
        $us = [string]$props.UninstallString
        if ($us -match '"?([^"]+\\Uninstall\.exe)"?') {
          $parent = Split-Path $Matches[1] -Parent
          if ($parent) { $paths += $parent }
        }
      }
    }
  }
  return ($paths | Where-Object { $_ } | ForEach-Object { $_.Trim().TrimEnd('\') } | Select-Object -Unique)
}

# ========== 0) COLLECT INSTALL PATHS ==========
Write-Log "STEP 0 collect install locations from registry"
foreach ($d in (Get-RegInstallDirs)) {
  Write-Log ("registry InstallDir: " + $d)
  Add-TargetDir $d
  # Parent NKDentalSoft root if Server/Client subfolder
  $parent = Split-Path $d -Parent
  if ($parent -and ((Split-Path $parent -Leaf) -eq "NKDentalSoft")) {
    Add-TargetDir $parent
  }
}

# ========== 1) STOP ==========
Write-Log "STEP 1 stop processes"
$procNames = @(
  "nkdentalsoft-server",
  "ConnectClinic",
  "nkdentalsoft-client",
  "nkdentalsoft-client-portables",
  "msedge_proxy"
)
Stop-NamedProcesses -Names $procNames

foreach ($base in @(
    (Join-Path $env:ProgramFiles "NKDentalSoft\Server"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Server")
  ) + @($script:TargetDirs | Where-Object { $_ -match 'Server$|Server\\?$' })) {
  $stopScript = Join-Path $base "scripts\stop_for_upgrade.ps1"
  if (Test-Path -LiteralPath $stopScript) {
    Invoke-Step -Label ("stop_for_upgrade " + $stopScript) -Action {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null
    }
  }
  $serverExe = Join-Path $base "nkdentalsoft-server.exe"
  if (Test-Path -LiteralPath $serverExe) {
    Invoke-Step -Label ("server stop/remove " + $serverExe) -Action {
      & $serverExe stop 2>$null | Out-Null
      & $serverExe remove 2>$null | Out-Null
    }
  }
}

Clear-TcpPort -Port 8001
Clear-TcpPort -Port 37020
Stop-NamedProcesses -Names $procNames

# ========== 2) SERVICE / TASK ==========
Write-Log "STEP 2 service and scheduled tasks"
foreach ($svc in @("NKDentalSoftServer", "NKDentalSoft", "nkdentalsoft-server")) {
  Invoke-Step -Label ("sc stop/delete " + $svc) -Action {
    sc.exe stop $svc 2>$null | Out-Null
    Start-Sleep -Milliseconds 400
    sc.exe delete $svc 2>$null | Out-Null
  }
}
foreach ($tn in @(
    "NKDentalSoft Server",
    "NKDentalSoft",
    "\NKDentalSoft Server",
    "\NKDentalSoft"
  )) {
  Invoke-Step -Label ("schtasks delete " + $tn) -Action {
    schtasks.exe /Delete /TN $tn /F 2>$null | Out-Null
  }
}
Invoke-Step -Label "schtasks scan NKDental*" -Action {
  $xml = schtasks.exe /Query /FO CSV /V 2>$null
  if (-not $xml) { return }
  $xml | Select-String -Pattern 'NKDental|DentalSoft|nkdentalsoft' -SimpleMatch:$false | ForEach-Object {
    # Best-effort: try delete by known names already covered
  }
  Get-ScheduledTask -ErrorAction SilentlyContinue |
    Where-Object { $_.TaskName -match 'NKDental|DentalSoft|nkdental' -or $_.TaskPath -match 'NKDental' } |
    ForEach-Object {
      Unregister-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Confirm:$false -ErrorAction SilentlyContinue
      Write-Log ("OK  Unregister-ScheduledTask " + $_.TaskPath + $_.TaskName)
    }
}

# ========== 3) Official uninstallers ==========
Write-Log "STEP 3 run product Uninstall.exe (silent)"
$uninstallers = New-Object System.Collections.Generic.List[string]
foreach ($u in @(
    (Join-Path $env:ProgramFiles "NKDentalSoft\Server\Uninstall.exe"),
    (Join-Path $env:ProgramFiles "NKDentalSoft\Client\Uninstall.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Server\Uninstall.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Client\Uninstall.exe")
  )) {
  if (Test-Path -LiteralPath $u) { [void]$uninstallers.Add($u) }
}
foreach ($d in $script:TargetDirs) {
  $u = Join-Path $d "Uninstall.exe"
  if (Test-Path -LiteralPath $u) { [void]$uninstallers.Add($u) }
}
foreach ($u in ($uninstallers | Select-Object -Unique)) {
  Invoke-Step -Label ("Uninstall.exe /S " + $u) -Action {
    $p = Start-Process -FilePath $u -ArgumentList "/S" -Wait -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
    if ($null -eq $p) { throw "uninstall did not start" }
  }
  Stop-NamedProcesses -Names $procNames
}

# ========== 4) FILESYSTEM ==========
Write-Log "STEP 4 wipe all known trees"

# Defaults
foreach ($p in @(
    (Join-Path $env:ProgramFiles "NKDentalSoft"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft"),
    (Join-Path $env:ProgramData "NKDentalSoft"),
    (Join-Path $env:LOCALAPPDATA "NKDentalSoft"),
    (Join-Path $env:APPDATA "NKDentalSoft"),
    (Join-Path $env:LOCALAPPDATA "N&K DentalSoft"),
    (Join-Path $env:APPDATA "N&K DentalSoft"),
    (Join-Path $env:LOCALAPPDATA "com.mdodontologia.nkdentalsoft"),
    (Join-Path $env:APPDATA "com.mdodontologia.nkdentalsoft"),
    (Join-Path $env:LOCALAPPDATA "nkdentalsoft-client"),
    (Join-Path $env:TEMP "NKDentalSoft"),
    (Join-Path $env:TEMP "NKDentalSoft-Clean"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\N&K DentalSoft")
  )) {
  Add-TargetDir $p
}

# Common drive roots (custom install D:\NKDentalSoft etc.)
foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
  $root = Join-Path ($drive.Root) "NKDentalSoft"
  if (Test-Path -LiteralPath $root) {
    Add-TargetDir $root
  }
}

foreach ($p in $script:TargetDirs) {
  Remove-TreeForce -Path $p
}

# Per-user wipe (all local profiles)
$usersRoot = Join-Path $env:SystemDrive "Users"
if (Test-Path -LiteralPath $usersRoot) {
  Get-ChildItem -LiteralPath $usersRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $u = $_.FullName
    foreach ($rel in @(
        "AppData\Local\NKDentalSoft",
        "AppData\Roaming\NKDentalSoft",
        "AppData\Local\N&K DentalSoft",
        "AppData\Roaming\N&K DentalSoft",
        "AppData\Local\com.mdodontologia.nkdentalsoft",
        "AppData\Roaming\com.mdodontologia.nkdentalsoft",
        "AppData\Local\nkdentalsoft-client",
        "AppData\Local\Temp\NKDentalSoft",
        "Desktop\HOTSPOT.txt",
        "Desktop\NKDentalSoft-HOTSPOT.txt"
      )) {
      Remove-TreeForce -Path (Join-Path $u $rel)
      if ($rel -match '\.txt$') {
        Remove-FileForce -Path (Join-Path $u $rel)
      }
    }
    # User Start Menu / Desktop shortcuts
    foreach ($sm in @(
        (Join-Path $u "AppData\Roaming\Microsoft\Windows\Start Menu\Programs\N&K DentalSoft"),
        (Join-Path $u "Desktop")
      )) {
      if ($sm -match 'Desktop$') {
        Get-ChildItem -LiteralPath $sm -Filter "*DentalSoft*" -ErrorAction SilentlyContinue | ForEach-Object {
          if ($_.Name -eq "NKDentalSoft-limpia.log") { return }
          Remove-FileForce -Path $_.FullName
        }
        Get-ChildItem -LiteralPath $sm -Filter "*NKDental*" -ErrorAction SilentlyContinue | ForEach-Object {
          if ($_.Name -eq "NKDentalSoft-limpia.log") { return }
          Remove-FileForce -Path $_.FullName
        }
        Get-ChildItem -LiteralPath $sm -Filter "*Hotspot clinica*" -ErrorAction SilentlyContinue | ForEach-Object {
          Remove-FileForce -Path $_.FullName
        }
        Get-ChildItem -LiteralPath $sm -Filter "*Reparar red LAN*" -ErrorAction SilentlyContinue | ForEach-Object {
          Remove-FileForce -Path $_.FullName
        }
        Get-ChildItem -LiteralPath $sm -Filter "*ConnectClinic*" -ErrorAction SilentlyContinue | ForEach-Object {
          Remove-FileForce -Path $_.FullName
        }
      } else {
        Remove-TreeForce -Path $sm
      }
    }
  }
}

# ========== 5) SHORTCUTS (current session extras) ==========
Write-Log "STEP 5 shortcuts current session"
$shortcutDirs = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

foreach ($dir in $shortcutDirs) {
  foreach ($pat in @("*DentalSoft*", "*NKDental*", "*ConnectClinic*", "*Hotspot clinica*", "*Reparar red LAN*", "*Hotspot clinica*")) {
    Get-ChildItem -LiteralPath $dir -Filter $pat -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.FullName -eq $script:LogPath) { return }
      if ($_.Name -eq "NKDentalSoft-limpia.log") { return }
      Remove-FileForce -Path $_.FullName
    }
  }
  Remove-TreeForce -Path (Join-Path $dir "N&K DentalSoft")
}

# Hotspot file in ProgramData
Remove-FileForce -Path (Join-Path $env:ProgramData "NKDentalSoft\HOTSPOT.txt")

# Prefetch
$prefetch = Join-Path $env:SystemRoot "Prefetch"
if (Test-Path -LiteralPath $prefetch) {
  Get-ChildItem -LiteralPath $prefetch -Filter "*NKDENTAL*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-FileForce -Path $_.FullName
  }
  Get-ChildItem -LiteralPath $prefetch -Filter "*CONNECTCLINIC*" -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-FileForce -Path $_.FullName
  }
}

# ========== 6) FIREWALL ==========
Write-Log "STEP 6 firewall"
$fwKnown = @(
  "NKDentalSoft Server 8001",
  "NKDentalSoft LAN Discovery 37020",
  "NKDentalSoft Server EXE",
  "NKDentalSoft Server EXE Out",
  "NKDentalSoft ICMP Allow",
  "nkdentalsoft-server",
  "N&K DentalSoft",
  "N&K DentalSoft Server",
  "N&K DentalSoft Client"
)
foreach ($rule in $fwKnown) {
  Invoke-Step -Label ("firewall delete " + $rule) -Action {
    netsh advfirewall firewall delete rule name="$rule" | Out-Null
  }
}
Invoke-Step -Label "firewall scan residual names" -Action {
  $names = netsh advfirewall firewall show rule name=all |
    Select-String -Pattern 'Rule Name:\s*(.+)$' |
    ForEach-Object { $_.Matches[0].Groups[1].Value.Trim() } |
    Where-Object { $_ -match 'NKDental|nkdental|DentalSoft|ConnectClinic' } |
    Select-Object -Unique
  foreach ($name in $names) {
    netsh advfirewall firewall delete rule name="$name" | Out-Null
    Write-Log ("OK  firewall delete " + $name)
  }
}

# ========== 7) REGISTRY ==========
Write-Log "STEP 7 registry full purge"
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
    $pub = [string]$props.Publisher
    $keyLeaf = Split-Path $keyPath -Leaf
    $hit = $false
    if ($dn -and ($dn -match 'N&K DentalSoft|NKDentalSoft|nkdentalsoft|mdodontologia|ConnectClinic')) { $hit = $true }
    if ($pub -and ($pub -match 'N&K Systems|NKDentalSoft|N&K DentalSoft')) { $hit = $true }
    if ($keyLeaf -match 'NKDentalSoft|nkdentalsoft') { $hit = $true }
    if ($hit) {
      Invoke-Step -Label ("reg uninstall delete " + $keyLeaf) -Action {
        Remove-Item -LiteralPath $keyPath -Recurse -Force -ErrorAction Stop
      }
    }
  }
}

# Product keys
foreach ($k in @(
    "HKLM:\Software\NKDentalSoft",
    "HKLM:\Software\WOW6432Node\NKDentalSoft",
    "HKCU:\Software\NKDentalSoft",
    "HKLM:\Software\N&K DentalSoft",
    "HKCU:\Software\N&K DentalSoft",
    "HKLM:\Software\WOW6432Node\N&K DentalSoft"
  )) {
  if (Test-Path -LiteralPath $k) {
    Invoke-Step -Label ("reg delete tree " + $k) -Action {
      Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction Stop
    }
  }
}

# Run / RunOnce
foreach ($runKey in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce"
  )) {
  if (-not (Test-Path -LiteralPath $runKey)) { continue }
  $props = Get-ItemProperty -LiteralPath $runKey -ErrorAction SilentlyContinue
  if (-not $props) { continue }
  $props.PSObject.Properties | Where-Object {
    $_.Name -notmatch '^PS' -and (
      ([string]$_.Value -match 'NKDentalSoft|nkdentalsoft|ConnectClinic|N&K DentalSoft') -or
      ($_.Name -match 'NKDental|DentalSoft|ConnectClinic')
    )
  } | ForEach-Object {
    $name = $_.Name
    Invoke-Step -Label ("Run key remove " + $runKey + "\" + $name) -Action {
      Remove-ItemProperty -LiteralPath $runKey -Name $name -Force -ErrorAction Stop
    }
  }
}

# App Paths
foreach ($ap in @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\nkdentalsoft-server.exe",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\ConnectClinic.exe",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\nkdentalsoft-server.exe",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\ConnectClinic.exe"
  )) {
  if (Test-Path -LiteralPath $ap) {
    Invoke-Step -Label ("reg App Paths " + $ap) -Action {
      Remove-Item -LiteralPath $ap -Recurse -Force -ErrorAction Stop
    }
  }
}

# Classes / OpenWithProgids best-effort
foreach ($root in @(
    "HKCU:\Software\Classes",
    "HKLM:\Software\Classes"
  )) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -match 'NKDental|nkdentalsoft|ConnectClinic' } |
    ForEach-Object {
      Invoke-Step -Label ("reg Classes " + $_.PSChildName) -Action {
        Remove-Item -LiteralPath $_.PSPath -Recurse -Force -ErrorAction Stop
      }
    }
}

# ========== 8) VERIFY ==========
Write-Log "STEP 8 verify zero residue"
$left = @()
$check = @(
  (Join-Path $env:ProgramFiles "NKDentalSoft"),
  (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft"),
  (Join-Path $env:ProgramData "NKDentalSoft"),
  (Join-Path $env:LOCALAPPDATA "NKDentalSoft"),
  (Join-Path $env:APPDATA "NKDentalSoft")
)
foreach ($d in $script:TargetDirs) { $check += $d }
foreach ($p in ($check | Select-Object -Unique)) {
  if ($p -and (Test-Path -LiteralPath $p)) { $left += $p }
}
foreach ($n in @("nkdentalsoft-server", "ConnectClinic", "nkdentalsoft-client")) {
  if (Get-Process -Name $n -ErrorAction SilentlyContinue) {
    $left += ("process:" + $n)
  }
}
# Registry leftovers
foreach ($k in @(
    "HKLM:\Software\NKDentalSoft",
    "HKLM:\Software\WOW6432Node\NKDentalSoft",
    "HKCU:\Software\NKDentalSoft",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKDentalSoftServer",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NKDentalSoftClient"
  )) {
  if (Test-Path -LiteralPath $k) { $left += ("registry:" + $k) }
}

Write-Log ("Done. ok=" + $script:OkCount + " fail=" + $script:FailCount)
if ($left.Count -eq 0 -and -not $script:PendingReboot) {
  Write-Log "SUCCESS: ZERO residue — no NKDentalSoft leftovers."
  Write-Host ""
  Write-Host "Desinstalacion TOTAL OK. No quedaron residuos."
  Write-Host "Ya puede instalar Server y Client de nuevo."
  Write-Host ("Log: " + $script:LogPath)
  exit 0
}

if ($left.Count -eq 0 -and $script:PendingReboot) {
  Write-Log "SUCCESS after REBOOT: some locked files scheduled for deletion." "WARN"
  Write-Host ""
  Write-Host "Limpieza casi completa. REINICIE el PC para borrar archivos bloqueados."
  Write-Host ("Log: " + $script:LogPath)
  exit 0
}

Write-Log "INCOMPLETE leftovers:" "WARN"
foreach ($p in $left) { Write-Log ("  LEFT " + $p) "WARN" }
Write-Host ""
Write-Host "Quedaron restos (archivo en uso). REINICIE el PC y vuelva a ejecutar este desinstalador."
Write-Host ("Log: " + $script:LogPath)
exit 1
