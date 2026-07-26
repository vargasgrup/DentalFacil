# Stop N&K DentalSoft Server before overwrite/upgrade installs.
# Free TCP 8001 so a stale process cannot keep serving a dead UI.
#
# IMPORTANT: Invoke via `powershell -File ...` (child process). Do not call with
# the call operator `&` from another script that must continue afterward.
# ASCII-only file: Windows PowerShell 5.1 misparses UTF-8 without BOM.
param(
  [int]$WaitSeconds = 45,
  [int]$Port = 8001,
  [switch]$SkipWritableCheck,
  [switch]$AllowRename
)

$ErrorActionPreference = "Continue"
$svcName = "NKDentalSoftServer"
$procName = "nkdentalsoft-server"
$taskName = "NKDentalSoft Server"
$installDir = Join-Path $env:ProgramFiles "NKDentalSoft\Server"
$installExe = Join-Path $installDir "nkdentalsoft-server.exe"

function Stop-PortListeners {
  param([int]$ListenPort)
  Write-Host "[upgrade] Freeing TCP port $ListenPort ..."
  try {
    $conns = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue)
  } catch {
    $conns = @()
  }
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    if (-not $procId -or $procId -le 4) { continue }
    try {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $name = if ($p) { $p.ProcessName } else { "?" }
      Write-Host "[upgrade] Stopping PID $procId ($name) on :$ListenPort"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      & cmd.exe /c "taskkill /F /PID $procId /T >nul 2>&1"
    } catch {
      Write-Host "[upgrade] port kill note: $($_.Exception.Message)"
    }
  }
}

function Stop-NkProcesses {
  Write-Host "[upgrade] Ending $procName.exe ..."
  Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      Write-Host "[upgrade] Stop-Process PID $($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Host "[upgrade] process kill note: $($_.Exception.Message)"
    }
  }
  & cmd.exe /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"
}

function Test-ExeWritable {
  param([string]$Path)
  try {
    $fs = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
    $fs.Close()
    return $true
  } catch {
    return $false
  }
}

Write-Host "[upgrade] Pausing Scheduled Task '$taskName' (if present)..."
& schtasks.exe /End /TN $taskName 2>$null | Out-Null
& schtasks.exe /Change /TN $taskName /DISABLE 2>$null | Out-Null

Write-Host "[upgrade] Stopping Windows service $svcName (if present)..."
try {
  $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -ne "Stopped") {
      Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
      & sc.exe stop $svcName | Out-Null
      & net.exe stop $svcName /y 2>$null | Out-Null
    }
    & sc.exe config $svcName start= demand | Out-Null
    $svcDeadline = (Get-Date).AddSeconds([Math]::Min(30, $WaitSeconds))
    while ((Get-Date) -lt $svcDeadline) {
      $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
      if (-not $svc -or $svc.Status -eq "Stopped") { break }
      Start-Sleep -Milliseconds 500
    }
  }
} catch {
  Write-Host "[upgrade] service stop note: $($_.Exception.Message)"
}

if (Test-Path -LiteralPath $installExe) {
  try {
    & $installExe stop 2>$null | Out-Null
  } catch {
    # ignore - exe may not support SCM stop in desktop mode
  }
}

Stop-NkProcesses
Stop-PortListeners -ListenPort $Port
Start-Sleep -Seconds 1
Stop-NkProcesses
Stop-PortListeners -ListenPort $Port

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  $still = Get-Process -Name $procName -ErrorAction SilentlyContinue
  $portBusy = $false
  try {
    $portBusy = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    $portBusy = $false
  }
  if (-not $still -and -not $portBusy) { break }
  Stop-NkProcesses
  if ($portBusy) { Stop-PortListeners -ListenPort $Port }
  Start-Sleep -Milliseconds 400
}

if (-not $SkipWritableCheck -and (Test-Path -LiteralPath $installExe)) {
  Write-Host "[upgrade] Waiting until EXE is writable..."
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    if (Test-ExeWritable -Path $installExe) {
      $ok = $true
      break
    }
    Stop-NkProcesses
    Start-Sleep -Milliseconds 500
  }

  if (-not $ok -and $AllowRename) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $bak = Join-Path $installDir ("nkdentalsoft-server.exe.old_" + $stamp)
    Write-Host "[upgrade] EXE still locked - renaming aside"
    try {
      Move-Item -LiteralPath $installExe -Destination $bak -Force
      $ok = $true
      Write-Host "[upgrade] Rename OK - installer can write a new EXE"
    } catch {
      Write-Host "[upgrade] Rename failed: $($_.Exception.Message)"
    }
  }

  if (-not $ok) {
    Write-Host "[upgrade] WARNING: exe still locked. Close N&K DentalSoft and retry."
    exit 2
  }
} elseif ($SkipWritableCheck) {
  Write-Host "[upgrade] SkipWritableCheck - not waiting on exe lock."
}

Write-Host "[upgrade] Ready to overwrite installation files."
exit 0
