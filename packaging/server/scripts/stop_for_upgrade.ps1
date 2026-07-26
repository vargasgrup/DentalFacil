# Stop N&K DentalSoft Server before overwrite/upgrade installs.
# Also frees TCP 8001 so a stale API process cannot keep serving {"detail":"Not Found"}.
param(
  [int]$WaitSeconds = 25,
  [int]$Port = 8001
)

$ErrorActionPreference = "Continue"
$svcName = "NKDentalSoftServer"
$procName = "nkdentalsoft-server"
$installExe = Join-Path ${env:ProgramFiles} "NKDentalSoft\Server\nkdentalsoft-server.exe"

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
    # Wait until SCM reports Stopped (LocalSystem holds file locks otherwise)
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

Write-Host "[upgrade] Ending process $procName.exe (console / foreground)..."
Get-Process -Name $procName -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    Stop-Process -Id $_.Id -Force -ErrorAction Stop
  } catch {
    Write-Host "[upgrade] process kill note: $($_.Exception.Message)"
  }
}
cmd /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"

Stop-PortListeners -ListenPort $Port

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  $still = Get-Process -Name $procName -ErrorAction SilentlyContinue
  $portBusy = $false
  try {
    $portBusy = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {}
  if (-not $still -and -not $portBusy) { break }
  if ($portBusy) { Stop-PortListeners -ListenPort $Port }
  Start-Sleep -Milliseconds 400
}

if (Test-Path $installExe) {
  Write-Host "[upgrade] Waiting until $installExe is writable..."
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $fs = [System.IO.File]::Open(
        $installExe,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
      )
      $fs.Close()
      $ok = $true
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $ok) {
    Write-Host "[upgrade] WARNING: exe still locked. Close any open Server console and retry."
    exit 2
  }
}

Write-Host "[upgrade] Ready to overwrite installation files."
exit 0
