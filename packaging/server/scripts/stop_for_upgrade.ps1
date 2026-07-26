# Stop N&K DentalSoft Server before overwrite/upgrade installs.
# Safe to run when nothing is installed yet.
param(
  [int]$WaitSeconds = 20
)

$ErrorActionPreference = "Continue"
$svcName = "NKDentalSoftServer"
$procName = "nkdentalsoft-server"
$installExe = Join-Path ${env:ProgramFiles} "NKDentalSoft\Server\nkdentalsoft-server.exe"

Write-Host "[upgrade] Stopping Windows service $svcName (if present)..."
try {
  $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -ne "Stopped") {
      Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
      sc.exe stop $svcName | Out-Null
    }
    # Avoid SCM holding the binary during file replace
    sc.exe config $svcName start= demand | Out-Null
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
# Belt-and-suspenders
cmd /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"

# Close cmd windows running Start-Server.bat is harder; killing the exe is enough for file locks.

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  $still = Get-Process -Name $procName -ErrorAction SilentlyContinue
  if (-not $still) { break }
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
