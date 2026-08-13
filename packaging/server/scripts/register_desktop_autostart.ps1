# Register clinic desktop autostart (Scheduled Task) and remove zombie Win32 service.
# Requires Administrator. Invoked by the NSIS installer and repair_startup.cmd.
# ASCII-only for Windows PowerShell 5.1.
param(
  [string]$InstallDir = $(Join-Path ${env:ProgramFiles} "NKDentalSoft\Server")
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$InstallDir = [string]$InstallDir
$InstallDir = $InstallDir.Trim().Trim('"').TrimEnd('\')

$exe = Join-Path $InstallDir "nkdentalsoft-server.exe"
$stopScript = Join-Path $InstallDir "scripts\stop_for_upgrade.ps1"
$logDir = Join-Path $env:ProgramData "NKDentalSoft\logs"
if (-not $env:ProgramData) {
  $logDir = Join-Path $env:SystemDrive "ProgramData\NKDentalSoft\logs"
}
$bootLog = Join-Path $logDir "install_autostart.log"

function Write-Boot([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  Write-Host $line
  try {
    if (-not (Test-Path -LiteralPath $logDir)) {
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -LiteralPath $bootLog -Value $line -Encoding UTF8
  } catch {}
}

try {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  Set-Content -LiteralPath $bootLog -Value ("NKDentalSoft install_autostart " + (Get-Date -Format "o")) -Encoding UTF8
} catch {}

Write-Boot ("[desktop] InstallDir=" + $InstallDir)
try {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { $isAdmin = $false }
Write-Boot ("[desktop] Admin=" + $isAdmin + " User=" + $env:USERNAME)

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Boot ("[desktop] ERROR missing exe: " + $exe)
  throw ("Server exe not found: " + $exe)
}

function Run-Hidden {
  param([string]$FilePath, [string[]]$ArgumentList, [int]$Seconds = 60)
  try {
    $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WindowStyle Hidden -PassThru -ErrorAction Stop
    if (-not $p.WaitForExit($Seconds * 1000)) {
      try { $p.Kill() } catch {}
      return 124
    }
    return $p.ExitCode
  } catch {
    Write-Boot ("[desktop] Run-Hidden fail " + $FilePath + " :: " + $_.Exception.Message)
    return 1
  }
}

$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $psExe)) { $psExe = "powershell.exe" }

if (Test-Path -LiteralPath $stopScript) {
  Write-Boot "[desktop] Stopping previous instance (child process, SkipWritableCheck)..."
  $code = Run-Hidden -FilePath $psExe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $stopScript,
    "-InstallDir", $InstallDir, "-Port", "8001", "-SkipWritableCheck"
  ) -Seconds 90
  Write-Boot ("[desktop] stop_for_upgrade exit=" + $code)
} else {
  Write-Boot "[desktop] stop_for_upgrade.ps1 missing - kill by name only"
  Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Run-Hidden -FilePath "cmd.exe" -ArgumentList @("/c", "taskkill /F /IM nkdentalsoft-server.exe /T") -Seconds 15 | Out-Null
}

try { & $exe stop 2>$null } catch {}
try { & $exe remove 2>$null } catch {}
Run-Hidden -FilePath "sc.exe" -ArgumentList @("stop", "NKDentalSoftServer") -Seconds 10 | Out-Null
Run-Hidden -FilePath "sc.exe" -ArgumentList @("delete", "NKDentalSoftServer") -Seconds 10 | Out-Null

@(
  (Join-Path $InstallDir "server_entry.py"),
  (Join-Path $InstallDir "_internal\server_entry.py"),
  (Join-Path $InstallDir "windows_service.py"),
  (Join-Path $InstallDir "_internal\windows_service.py"),
  (Join-Path $InstallDir "desktop_runtime.py"),
  (Join-Path $InstallDir "_internal\desktop_runtime.py")
) | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
    Write-Boot ("[desktop] Removed shadow module " + $_)
  }
}

Start-Sleep -Seconds 2

$taskName = "NKDentalSoft Server"
Write-Boot ("[desktop] Registering Scheduled Task '" + $taskName + "' (ONLOGON)...")
Run-Hidden -FilePath "schtasks.exe" -ArgumentList @("/Delete", "/TN", $taskName, "/F") -Seconds 15 | Out-Null

$tr = '"' + $exe + '" --foreground'
$taskOk = $false
$code = Run-Hidden -FilePath "schtasks.exe" -ArgumentList @(
  "/Create", "/TN", $taskName, "/TR", $tr, "/SC", "ONLOGON", "/RL", "HIGHEST", "/F", "/IT"
) -Seconds 20
if ($code -ne 0) {
  Write-Boot ("[desktop] WARNING: schtasks HIGHEST exit=" + $code + " - trying LIMITED")
  $code = Run-Hidden -FilePath "schtasks.exe" -ArgumentList @(
    "/Create", "/TN", $taskName, "/TR", $tr, "/SC", "ONLOGON", "/RL", "LIMITED", "/F", "/IT"
  ) -Seconds 20
}
if ($code -ne 0) {
  Write-Boot ("[desktop] WARNING: schtasks create failed exit=" + $code)
} else {
  $taskOk = $true
  Write-Boot "[desktop] Scheduled Task registered"
}

$repairLan = Join-Path $InstallDir "scripts\repair_lan.ps1"
if (Test-Path -LiteralPath $repairLan) {
  Write-Boot "[desktop] repair_lan.ps1 (with ServerExe)..."
  $code = Run-Hidden -FilePath $psExe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $repairLan,
    "-ServerExe", $exe, "-Quiet"
  ) -Seconds 90
  Write-Boot ("[desktop] repair_lan exit=" + $code)
}

function Test-PortOpen([int]$Port = 8001) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800, $false)
    if (-not $ok) { try { $tcp.Close() } catch {}; return $false }
    try { $tcp.EndConnect($iar) } catch { try { $tcp.Close() } catch {}; return $false }
    try { $tcp.Close() } catch {}
    return $true
  } catch {
    return $false
  }
}

function Start-ServerHidden {
  $env:NKDENTALSOFT_DISABLE_TLS = "1"
  Write-Boot "[desktop] Start-Process --foreground"
  Start-Process -FilePath $exe -ArgumentList "--foreground" -WorkingDirectory $InstallDir -WindowStyle Hidden
}

function Test-LogFresh([string]$Path, [int]$Seconds = 45) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    $age = (Get-Date) - (Get-Item -LiteralPath $Path).LastWriteTime
    return ($age.TotalSeconds -le $Seconds)
  } catch {
    return $false
  }
}

# First post-install / upgrade: existing clinica.db migrations + Defender first-scan
# can exceed 90s. NEVER taskkill a process that is still writing startup.log.
$startupLog = Join-Path $logDir "startup.log"
$ok = $false
for ($attempt = 1; $attempt -le 2; $attempt++) {
  if (Test-PortOpen) {
    Write-Boot ("[desktop] Port 8001 already listening (attempt " + $attempt + ")")
    $ok = $true
    break
  }
  $alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
  if (-not $alive) {
    Start-ServerHidden
  } else {
    Write-Boot ("[desktop] Server already running PID=" + (($alive | ForEach-Object { $_.Id }) -join ","))
  }
  for ($i = 1; $i -le 180; $i++) {
    if (Test-PortOpen) {
      Write-Boot ("[desktop] Port 8001 open after " + $i + "s (attempt " + $attempt + ")")
      $ok = $true
      break
    }
    $alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
    if (-not $alive -and $i -ge 8) {
      Write-Boot ("[desktop] process exited at " + $i + "s - will retry")
      break
    }
    if (($i % 15) -eq 0) {
      $fresh = Test-LogFresh -Path $startupLog -Seconds 45
      Write-Boot ("[desktop] still waiting " + $i + "s alive=" + [bool]$alive + " logFresh=" + $fresh)
    }
    Start-Sleep -Seconds 1
  }
  if ($ok) { break }
  $alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
  $fresh = Test-LogFresh -Path $startupLog -Seconds 45
  if ($alive -and $fresh) {
    Write-Boot "[desktop] PARTIAL OK - process still bootstrapping (do not kill mid-migration)"
    exit 0
  }
  if ($alive -and -not $fresh) {
    Write-Boot "[desktop] stale process (no log progress) - restarting once"
    Run-Hidden -FilePath "cmd.exe" -ArgumentList @("/c", "taskkill /F /IM nkdentalsoft-server.exe /T") -Seconds 15 | Out-Null
    Start-Sleep -Seconds 3
    continue
  }
  Write-Boot ("[desktop] Attempt " + $attempt + " timed out - retrying")
  Start-Sleep -Seconds 2
}

if ($ok) {
  Write-Boot "[desktop] OK - http://127.0.0.1:8001/ is listening"
  exit 0
}

$alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
if ($taskOk -and $alive) {
  Write-Boot "[desktop] PARTIAL OK - task registered, process running, port not open yet"
  exit 0
}
if ($taskOk) {
  Write-Boot "[desktop] PARTIAL OK - task registered; use Open-UI.bat or next logon"
  exit 0
}

Write-Boot ("[desktop] FAILED - see " + $bootLog + " and " + (Join-Path $logDir "startup.log"))
throw "Server did not open TCP 8001 after install start. See install_autostart.log"
