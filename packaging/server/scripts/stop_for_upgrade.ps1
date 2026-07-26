# Stop N&K DentalSoft Server before overwrite/upgrade installs.
# Also frees TCP 8001 so a stale API process cannot keep serving {"detail":"Not Found"}.
#
# IMPORTANT: Always invoke this script via `powershell -File ...` (child process),
# never with the call operator `&` from another script that must continue afterward —
# bare `exit` would terminate the parent PowerShell host.
param(
  [int]$WaitSeconds = 45,
  [int]$Port = 8001,
  # Post-install autostart: files are already written; skip exe lock wait (Defender).
  [switch]$SkipWritableCheck,
  # When still locked, rename exe so NSIS can write a fresh binary.
  [switch]$AllowRename
)

$ErrorActionPreference = "Continue"
$svcName = "NKDentalSoftServer"
$procName = "nkdentalsoft-server"
$taskName = "NKDentalSoft Server"
$installDir = Join-Path ${env:ProgramFiles} "NKDentalSoft\Server"
$installExe = Join-Path $installDir "nkdentalsoft-server.exe"

function Stop-PortListeners([int]$ListenPort) {
  Write-Host "[upgrade] Freeing TCP port $ListenPort ..."
  try {
    $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
  } catch {
    $conns = @()
  }
  foreach ($c in @($conns)) {
    $procId = $c.OwningProcess
    if (-not $procId -or $procId -le 4) { continue }
    try {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      $name = if ($p) { $p.ProcessName } else { "?" }
      $path = if ($p) { $p.Path } else { "" }
      Write-Host "[upgrade] Stopping PID $procId ($name) holding :$ListenPort  $path"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      cmd /c "taskkill /F /PID $procId /T >nul 2>&1"
    } catch {
      Write-Host "[upgrade] port kill note: $($_.Exception.Message)"
    }
  }
}

function Stop-NkProcesses {
  Write-Host "[upgrade] Ending $procName.exe tree..."
  Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      Write-Host "[upgrade] Stop-Process PID $($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction Stop
    } catch {
      Write-Host "[upgrade] process kill note: $($_.Exception.Message)"
    }
  }
  cmd /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"
  # WebView2 host child can keep the parent image mapped
  cmd /c "taskkill /F /IM msedgewebview2.exe /T >nul 2>&1"
}

Write-Host "[upgrade] Pausing Scheduled Task '$taskName' (if present)..."
schtasks.exe /End /TN $taskName 2>$null | Out-Null
schtasks.exe /Change /TN $taskName /DISABLE 2>$null | Out-Null

Write-Host "[upgrade] Stopping Windows service $svcName (if present)..."
try {
  $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -ne "Stopped") {
      Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
      sc.exe stop $svcName | Out-Null
      net.exe stop $svcName /y 2>$null | Out-Null
    }
    sc.exe config $svcName start= demand | Out-Null
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

if (Test-Path $installExe) {
  try {
    & $installExe stop 2>$null | Out-Null
  } catch {}
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
  } catch {}
  if (-not $still -and -not $portBusy) { break }
  if ($still -or $portBusy) {
    Stop-NkProcesses
    if ($portBusy) { Stop-PortListeners -ListenPort $Port }
  }
  Start-Sleep -Milliseconds 400
}

function Test-ExeWritable([string]$Path) {
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

if (-not $SkipWritableCheck -and (Test-Path $installExe)) {
  Write-Host "[upgrade] Waiting until $installExe is writable..."
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    if (Test-ExeWritable $installExe) {
      $ok = $true
      break
    }
    Stop-NkProcesses
    Start-Sleep -Milliseconds 500
  }

  if (-not $ok -and $AllowRename) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $bak = Join-Path $installDir "nkdentalsoft-server.exe.old_$stamp"
    Write-Host "[upgrade] EXE still locked — renaming to $bak"
    try {
      Move-Item -LiteralPath $installExe -Destination $bak -Force
      $ok = $true
      Write-Host "[upgrade] Rename OK — installer can write a new EXE"
    } catch {
      Write-Host "[upgrade] Rename failed: $($_.Exception.Message)"
    }
  }

  if (-not $ok) {
    Write-Host "[upgrade] WARNING: exe still locked. Close N&K DentalSoft (bandeja / ventana) and retry."
    exit 2
  }
} elseif ($SkipWritableCheck) {
  Write-Host "[upgrade] SkipWritableCheck — not waiting on exe lock."
}

Write-Host "[upgrade] Ready to overwrite installation files."
exit 0
