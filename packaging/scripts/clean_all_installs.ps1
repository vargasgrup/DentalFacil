# N&K DentalSoft TOTAL WIPE - PS 5.1 ASCII. Logs to Desktop and TEMP.
# Requires Administrator. Without admin exit code = 3.
param(
  [switch]$NoElevate,
  [switch]$WhatIf
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Test-IsAdmin {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch { return $false }
}

function Get-DesktopPath {
  foreach ($d in @(
      [Environment]::GetFolderPath("Desktop"),
      (Join-Path $env:USERPROFILE "Desktop"),
      (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
      (Join-Path $env:PUBLIC "Desktop"),
      $env:TEMP
    )) {
    if ($d -and (Test-Path -LiteralPath $d)) { return $d }
  }
  return $env:TEMP
}

$script:LogPaths = @(
  (Join-Path (Get-DesktopPath) "NKDentalSoft-limpia.log"),
  (Join-Path $env:TEMP "NKDentalSoft-limpia.log")
)
$BrandDir = "N" + [char]38 + "K DentalSoft"
$script:PendingReboot = $false

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  foreach ($lp in $script:LogPaths) {
    try { Add-Content -LiteralPath $lp -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
  }
}

function Init-Log {
  $h = "NKDentalSoft TOTAL WIPE " + (Get-Date -Format "s") + " Admin=" + (Test-IsAdmin) + " User=" + $env:USERNAME
  foreach ($lp in $script:LogPaths) {
    try { Set-Content -LiteralPath $lp -Value $h -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
  }
}

if (-not $NoElevate -and -not (Test-IsAdmin)) {
  Write-Host "Solicitando Administrador..."
  $alist = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $MyInvocation.MyCommand.Path, "-NoElevate")
  if ($WhatIf) { $alist += "-WhatIf" }
  try {
    $p = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $alist -Wait -PassThru
    if ($null -eq $p) { exit 2 }
    exit $p.ExitCode
  } catch {
    Write-Host ("ERROR elevacion: " + $_.Exception.Message)
    exit 2
  }
}

Init-Log
Write-Log "START wipe"
Write-Log ("Logs: " + ($script:LogPaths -join " | "))

if (-not (Test-IsAdmin)) {
  Write-Log "NOT ADMIN. Cannot delete Program Files / ProgramData." "ERROR"
  Write-Host ""
  Write-Host "ERROR: Ejecute como Administrador (UAC Si)."
  Write-Host ("Log: " + $script:LogPaths[0])
  exit 3
}

function Run-Timeout {
  param([string]$FilePath, [string[]]$ArgumentList, [int]$Seconds = 20, [string]$Label = "")
  if ($WhatIf) {
    Write-Log ("WHATIF " + $Label)
    return 0
  }
  try {
    $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WindowStyle Hidden -PassThru -ErrorAction Stop
    if (-not $p.WaitForExit($Seconds * 1000)) {
      Write-Log ("TIMEOUT " + $Seconds + "s " + $Label) "WARN"
      try { $p.Kill() } catch {}
      return 124
    }
    return $p.ExitCode
  } catch {
    Write-Log ("FAIL " + $Label + " :: " + $_.Exception.Message) "WARN"
    return 1
  }
}

function Kill-Names {
  param([string[]]$Names)
  foreach ($n in $Names) {
    Write-Log ("kill " + $n)
    if ($WhatIf) { continue }
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", "taskkill /F /IM $n.exe /T") -Seconds 8 -Label ("taskkill " + $n) | Out-Null
  }
}

function Kill-ByPathHint {
  # Mata procesos cuyo ejecutable vive bajo NKDentalSoft / ConnectClinic
  if ($WhatIf) { return }
  $hints = @("NKDentalSoft", "ConnectClinic", "nkdentalsoft")
  Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    $proc = $_
    $path = $null
    try { $path = $proc.Path } catch { $path = $null }
    if (-not $path) {
      try { $path = $proc.MainModule.FileName } catch { $path = $null }
    }
    if (-not $path) { return }
    $hit = $false
    foreach ($h in $hints) {
      if ($path -like ("*" + $h + "*")) { $hit = $true; break }
    }
    if (-not $hit) { return }
    Write-Log ("kill-by-path " + $proc.ProcessName + " :: " + $path)
    try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Mark-DeleteOnReboot {
  param([string]$Path)
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return }
  try {
    if (-not ("NkdMoveFileEx" -as [type])) {
      Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NkdMoveFileEx {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool MoveFileEx(string existing, string dest, int flags);
}
"@
    }
    # MOVEFILE_DELAY_UNTIL_REBOOT = 4
    $ok = [NkdMoveFileEx]::MoveFileEx($Path, $null, 4)
    if ($ok) {
      $script:PendingReboot = $true
      Write-Log ("scheduled reboot-delete " + $Path)
    }
  } catch {
    Write-Log ("reboot-delete fail " + $Path + " :: " + $_.Exception.Message) "WARN"
  }
}

function Clear-AttribTree {
  param([string]$Path)
  Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('attrib -R -S -H "' + $Path + '\*" /S /D')) -Seconds 30 -Label ("attrib " + $Path) | Out-Null
  Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('attrib -R -S -H "' + $Path + '"')) -Seconds 10 -Label ("attrib root " + $Path) | Out-Null
}

function Nuke-DirRobocopy {
  param([string]$Path)
  # Robocopy /MIR empty folder forces delete of locked tree content under admin more reliably than rd
  $empty = Join-Path $env:TEMP ("nkd_empty_" + [Guid]::NewGuid().ToString("N"))
  try {
    New-Item -ItemType Directory -Path $empty -Force | Out-Null
    Run-Timeout -FilePath "robocopy.exe" -ArgumentList @($empty, $Path, "/MIR", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np") -Seconds 90 -Label ("robocopy " + $Path) | Out-Null
  } finally {
    try { Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue } catch {}
  }
}

function Del-Path {
  param([string]$Path)
  if (-not $Path) { return }
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Log ("absent " + $Path)
    return
  }
  Write-Log ("DELETE " + $Path)
  if ($WhatIf) { return }

  $isDir = $false
  try { $isDir = (Get-Item -LiteralPath $Path -Force -ErrorAction Stop).PSIsContainer } catch {}

  if ($isDir) {
    Clear-AttribTree -Path $Path
    Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('rd /s /q "' + $Path + '"')) -Seconds 60 -Label ("rd " + $Path) | Out-Null
    if (Test-Path -LiteralPath $Path) {
      Nuke-DirRobocopy -Path $Path
      Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('rd /s /q "' + $Path + '"')) -Seconds 30 -Label ("rd after robocopy " + $Path) | Out-Null
    }
  } else {
    Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('attrib -R -S -H "' + $Path + '" & del /f /q "' + $Path + '"')) -Seconds 20 -Label ("del " + $Path) | Out-Null
  }

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Log ("OK gone " + $Path)
    return
  }

  # takeown + ACL admins
  Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('takeown /F "' + $Path + '" /R /D Y /A')) -Seconds 60 -Label ("takeown " + $Path) | Out-Null
  Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('icacls "' + $Path + '" /grant *S-1-5-32-544:F /T /C /Q')) -Seconds 60 -Label ("icacls " + $Path) | Out-Null
  Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('icacls "' + $Path + '" /grant Administrators:F /T /C /Q')) -Seconds 45 -Label ("icacls2 " + $Path) | Out-Null

  if ($isDir) {
    Nuke-DirRobocopy -Path $Path
    Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('rd /s /q "' + $Path + '"')) -Seconds 60 -Label ("rd2 " + $Path) | Out-Null
  }
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue

  if (Test-Path -LiteralPath $Path) {
    try {
      $newName = (Split-Path $Path -Leaf) + ".old_" + (Get-Date -Format "yyyyMMddHHmmss")
      Rename-Item -LiteralPath $Path -NewName $newName -Force -ErrorAction Stop
      $ren = Join-Path (Split-Path $Path -Parent) $newName
      Write-Log ("renamed leftover -> " + $ren)
      if ((Get-Item -LiteralPath $ren -Force).PSIsContainer) {
        Nuke-DirRobocopy -Path $ren
        Run-Timeout -FilePath "cmd.exe" -ArgumentList @("/c", ('rd /s /q "' + $ren + '"')) -Seconds 30 -Label "rd ren" | Out-Null
      } else {
        Remove-Item -LiteralPath $ren -Force -ErrorAction SilentlyContinue
      }
      if (Test-Path -LiteralPath $ren) {
        Mark-DeleteOnReboot -Path $ren
      }
    } catch {
      Write-Log ("LEFT locked " + $Path) "WARN"
      Mark-DeleteOnReboot -Path $Path
    }
  }

  if (Test-Path -LiteralPath $Path) {
    Write-Log ("LEFT " + $Path) "WARN"
  } else {
    Write-Log ("OK gone " + $Path)
  }
}

function Get-RegInstallDirs {
  $list = @()
  foreach ($k in @(
      "HKLM:\Software\NKDentalSoft\Server",
      "HKLM:\Software\NKDentalSoft\Client",
      "HKLM:\Software\WOW6432Node\NKDentalSoft\Server",
      "HKLM:\Software\WOW6432Node\NKDentalSoft\Client"
    )) {
    if (-not (Test-Path -LiteralPath $k)) { continue }
    try {
      $d = [string](Get-ItemProperty -LiteralPath $k -ErrorAction Stop).InstallDir
      if ($d) { $list += $d.TrimEnd("\") }
    } catch {}
  }
  foreach ($root in @(
      "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
      "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
        $dn = [string]$p.DisplayName
        if ($dn -notmatch "DentalSoft|NKDentalSoft") { return }
        if ($p.InstallLocation) { $list += ([string]$p.InstallLocation).TrimEnd("\") }
      } catch {}
    }
  }
  return ($list | Where-Object { $_ } | Select-Object -Unique)
}

Write-Log "=== 1 STOP ==="
Kill-Names -Names @("nkdentalsoft-server", "ConnectClinic", "nkdentalsoft-client")
Kill-ByPathHint
Start-Sleep -Seconds 2
Kill-Names -Names @("nkdentalsoft-server", "ConnectClinic", "nkdentalsoft-client")
Kill-ByPathHint

Write-Log "=== 2 SERVICE/TASK ==="
Run-Timeout -FilePath "sc.exe" -ArgumentList @("stop", "NKDentalSoftServer") -Seconds 8 -Label "sc stop" | Out-Null
Run-Timeout -FilePath "sc.exe" -ArgumentList @("delete", "NKDentalSoftServer") -Seconds 8 -Label "sc delete" | Out-Null
# variantes de nombre de tarea
foreach ($tn in @("NKDentalSoft Server", "NKDentalSoftServer", "NK DentalSoft Server")) {
  Run-Timeout -FilePath "schtasks.exe" -ArgumentList @("/Delete", "/TN", $tn, "/F") -Seconds 10 -Label ("schtasks " + $tn) | Out-Null
}

# Silent product uninstallers (NSIS). Only when already elevated (no extra UAC).
Write-Log "=== 3 Uninstall.exe ==="
$unis = @()
foreach ($u in @(
    (Join-Path $env:ProgramFiles "NKDentalSoft\Server\Uninstall.exe"),
    (Join-Path $env:ProgramFiles "NKDentalSoft\Client\Uninstall.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Server\Uninstall.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Client\Uninstall.exe")
  )) {
  if (Test-Path -LiteralPath $u) { $unis += $u }
}
foreach ($d in (Get-RegInstallDirs)) {
  $u = Join-Path $d "Uninstall.exe"
  if (Test-Path -LiteralPath $u) { $unis += $u }
}
foreach ($u in ($unis | Select-Object -Unique)) {
  Write-Log ("Uninstall /S " + $u)
  # /S only; short timeout — full wipe continues regardless
  $parent = Split-Path $u -Parent
  Run-Timeout -FilePath $u -ArgumentList @("/S", ("_?=" + $parent)) -Seconds 30 -Label ("Uninstall " + $u) | Out-Null
  Kill-Names -Names @("nkdentalsoft-server", "ConnectClinic")
  Kill-ByPathHint
}

Write-Log "=== 4 DELETE PATHS ==="
$targets = New-Object System.Collections.Generic.List[string]
function Add-T([string]$p) {
  if (-not $p) { return }
  $t = $p.TrimEnd("\")
  if ($t -and -not $targets.Contains($t)) { [void]$targets.Add($t) }
}

foreach ($d in (Get-RegInstallDirs)) {
  Add-T $d
  $par = Split-Path $d -Parent
  if ($par -and ((Split-Path $par -Leaf) -eq "NKDentalSoft")) { Add-T $par }
}

Add-T (Join-Path $env:ProgramFiles "NKDentalSoft")
Add-T (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft")
Add-T (Join-Path $env:ProgramData "NKDentalSoft")
Add-T (Join-Path $env:LOCALAPPDATA "NKDentalSoft")
Add-T (Join-Path $env:APPDATA "NKDentalSoft")
Add-T (Join-Path $env:LOCALAPPDATA $BrandDir)
Add-T (Join-Path $env:APPDATA $BrandDir)
Add-T (Join-Path $env:LOCALAPPDATA "com.mdodontologia.nkdentalsoft")
Add-T (Join-Path $env:APPDATA "com.mdodontologia.nkdentalsoft")
Add-T (Join-Path $env:LOCALAPPDATA "nkdentalsoft-client")
Add-T (Join-Path $env:TEMP "NKDentalSoft")
Add-T (Join-Path $env:TEMP "NKDentalSoft-Clean")
Add-T (Join-Path $env:ProgramData ("Microsoft\Windows\Start Menu\Programs\" + $BrandDir))

for ($letter = 67; $letter -le 90; $letter++) {
  $drv = [string][char]$letter + ":\"
  if (-not (Test-Path -LiteralPath $drv)) { continue }
  try {
    $drive = Get-PSDrive -Name ([string][char]$letter) -ErrorAction SilentlyContinue
    if ($drive -and $drive.Provider.Name -ne "FileSystem") { continue }
  } catch {}
  $cand = Join-Path $drv "NKDentalSoft"
  if (Test-Path -LiteralPath $cand) { Add-T $cand }
}

$ur = Join-Path $env:SystemDrive "Users"
if (Test-Path -LiteralPath $ur) {
  Get-ChildItem -LiteralPath $ur -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $u = $_.FullName
    Add-T (Join-Path $u "AppData\Local\NKDentalSoft")
    Add-T (Join-Path $u "AppData\Roaming\NKDentalSoft")
    Add-T (Join-Path $u ("AppData\Local\" + $BrandDir))
    Add-T (Join-Path $u ("AppData\Roaming\" + $BrandDir))
    Add-T (Join-Path $u "AppData\Local\com.mdodontologia.nkdentalsoft")
    Add-T (Join-Path $u "AppData\Roaming\com.mdodontologia.nkdentalsoft")
    Add-T (Join-Path $u "AppData\Local\nkdentalsoft-client")
    Add-T (Join-Path $u ("AppData\Roaming\Microsoft\Windows\Start Menu\Programs\" + $BrandDir))
  }
}

Write-Log ("Total targets: " + $targets.Count)
foreach ($t in $targets) { Del-Path $t }

# second pass critical
Kill-Names -Names @("nkdentalsoft-server", "ConnectClinic", "nkdentalsoft-client")
Kill-ByPathHint
Start-Sleep -Seconds 1
Del-Path (Join-Path $env:ProgramFiles "NKDentalSoft")
Del-Path (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft")
Del-Path (Join-Path $env:ProgramData "NKDentalSoft")
Del-Path (Join-Path $env:LOCALAPPDATA "NKDentalSoft")

Write-Log "=== 5 SHORTCUTS ==="
$linkDirs = @(
  [Environment]::GetFolderPath("Desktop"),
  [Environment]::GetFolderPath("CommonDesktopDirectory"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

foreach ($dir in $linkDirs) {
  Del-Path (Join-Path $dir $BrandDir)
  Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match "DentalSoft|NKDental|ConnectClinic|Hotspot clinica|Reparar red LAN" -and
      $_.Name -notlike "NKDentalSoft-limpia*"
    } |
    ForEach-Object { Del-Path $_.FullName }
}

$pf = Join-Path $env:SystemRoot "Prefetch"
if (Test-Path -LiteralPath $pf) {
  Get-ChildItem -LiteralPath $pf -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "NKDENTAL|CONNECTCLINIC|DENTALSOFT" } |
    ForEach-Object { Del-Path $_.FullName }
}

Write-Log "=== 6 FIREWALL ==="
foreach ($rule in @(
    "NKDentalSoft Server 8001",
    "NKDentalSoft LAN Discovery 37020",
    "NKDentalSoft Server EXE",
    "NKDentalSoft Server EXE Out",
    "NKDentalSoft ICMP Allow",
    "nkdentalsoft-server"
  )) {
  Run-Timeout -FilePath "netsh.exe" -ArgumentList @("advfirewall", "firewall", "delete", "rule", ("name=" + $rule)) -Seconds 10 -Label ("fw " + $rule) | Out-Null
}

Write-Log "=== 7 REGISTRY ==="
foreach ($root in @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  )) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $props = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
      $dn = [string]$props.DisplayName
      $leaf = $_.PSChildName
      if (($dn -match "DentalSoft|NKDentalSoft|ConnectClinic") -or ($leaf -match "NKDentalSoft")) {
        Write-Log ("reg delete " + $leaf)
        if (-not $WhatIf) {
          Remove-Item -LiteralPath $_.PSPath -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
    } catch {}
  }
}
foreach ($k in @(
    "HKLM:\Software\NKDentalSoft",
    "HKLM:\Software\WOW6432Node\NKDentalSoft",
    "HKCU:\Software\NKDentalSoft"
  )) {
  if (Test-Path -LiteralPath $k) {
    Write-Log ("reg tree " + $k)
    if (-not $WhatIf) { Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
foreach ($runKey in @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
  )) {
  if (-not (Test-Path -LiteralPath $runKey)) { continue }
  $props = Get-ItemProperty -LiteralPath $runKey -ErrorAction SilentlyContinue
  if (-not $props) { continue }
  $props.PSObject.Properties | Where-Object {
    $_.Name -notmatch "^PS" -and (
      ([string]$_.Value -match "NKDentalSoft|ConnectClinic|DentalSoft") -or
      ($_.Name -match "NKDental|DentalSoft")
    )
  } | ForEach-Object {
    Write-Log ("Run remove " + $_.Name)
    if (-not $WhatIf) {
      Remove-ItemProperty -LiteralPath $runKey -Name $_.Name -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Log "=== 8 VERIFY ==="
$left = @()
foreach ($p in @(
    (Join-Path $env:ProgramFiles "NKDentalSoft"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft"),
    (Join-Path $env:ProgramData "NKDentalSoft"),
    (Join-Path $env:LOCALAPPDATA "NKDentalSoft")
  )) {
  if (Test-Path -LiteralPath $p) {
    $left += $p
    Write-Log ("LEFT " + $p) "WARN"
  }
}
foreach ($n in @("nkdentalsoft-server", "ConnectClinic")) {
  if (Get-Process -Name $n -ErrorAction SilentlyContinue) { $left += ("process:" + $n) }
}

$criticalGone = -not (
  (Test-Path -LiteralPath (Join-Path $env:ProgramFiles "NKDentalSoft")) -or
  (Test-Path -LiteralPath (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft")) -or
  (Test-Path -LiteralPath (Join-Path $env:ProgramData "NKDentalSoft"))
)

if ($left.Count -eq 0) {
  Write-Log "SUCCESS: ZERO residue"
  Write-Host ""
  Write-Host "Desinstalacion total OK."
  Write-Host ("Log: " + $script:LogPaths[0])
  exit 0
}

if ($criticalGone) {
  Write-Log "SUCCESS_PARTIAL critical paths removed"
  Write-Host ""
  Write-Host "Limpieza principal OK (quedan restos menores de perfil)."
  Write-Host ("Log: " + $script:LogPaths[0])
  exit 0
}

if ($script:PendingReboot) {
  Write-Log "REBOOT_REQUIRED files scheduled for deletion"
  Write-Host ""
  Write-Host "Carpeta en uso. Reinicie el PC y ejecute de nuevo el desinstalador."
  Write-Host ("Log: " + $script:LogPaths[0])
  exit 1
}

Write-Log "FAILED leftovers remain"
Write-Host ""
Write-Host "No se pudo borrar todo. Ejecute como Administrador, reinicie y re-ejecute."
Write-Host ("Log: " + $script:LogPaths[0])
exit 1
