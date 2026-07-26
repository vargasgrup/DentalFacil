# Register clinic desktop autostart (Scheduled Task) and remove zombie Win32 service.
# Requires Administrator.
param(
  [string]$InstallDir = $(Join-Path ${env:ProgramFiles} "NKDentalSoft\Server")
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $InstallDir "nkdentalsoft-server.exe"
if (-not (Test-Path $exe)) {
  throw "Server exe not found: $exe"
}

Write-Host "[desktop] Stopping/removing legacy Windows service NKDentalSoftServer ..."
& (Join-Path $InstallDir "scripts\stop_for_upgrade.ps1") -Port 8001 | Out-Host
try { & $exe stop } catch {}
try { & $exe remove } catch {}
sc.exe stop NKDentalSoftServer | Out-Null
sc.exe delete NKDentalSoftServer | Out-Null
cmd /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"
Start-Sleep -Seconds 2

$taskName = "NKDentalSoft Server"
Write-Host "[desktop] Registering Scheduled Task '$taskName' (ONLOGON) ..."
schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null

# Run as current user at logon — user-session networking (avoids Session-0 zombie service)
$tr = "`"$exe`" --foreground"
schtasks.exe /Create /TN $taskName /TR $tr /SC ONLOGON /RL LIMITED /F
if ($LASTEXITCODE -ne 0) {
  throw "schtasks create failed: $LASTEXITCODE"
}

# Also start now
Write-Host "[desktop] Starting server now ..."
$env:NKDENTALSOFT_DISABLE_TLS = "1"
Start-Process -FilePath $exe -ArgumentList "--foreground" -WorkingDirectory $InstallDir -WindowStyle Hidden

$ok = $false
for ($i = 1; $i -le 40; $i++) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", 8001)
    $tcp.Close()
    $ok = $true
    break
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

if (-not $ok) {
  throw "Server did not open TCP 8001. See $env:SystemDrive\ProgramData\NKDentalSoft\logs\startup.log"
}

Write-Host "[desktop] OK — http://127.0.0.1:8001/ is listening"
exit 0
