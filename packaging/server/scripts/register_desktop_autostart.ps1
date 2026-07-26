# Register clinic desktop autostart (Scheduled Task) and remove zombie Win32 service.
# Requires Administrator. Invoked by the NSIS installer and repair_startup.cmd.
param(
  [string]$InstallDir = $(Join-Path ${env:ProgramFiles} "NKDentalSoft\Server")
)

$ErrorActionPreference = "Stop"
$exe = Join-Path $InstallDir "nkdentalsoft-server.exe"
$stopScript = Join-Path $InstallDir "scripts\stop_for_upgrade.ps1"
$logDir = Join-Path $env:SystemDrive "ProgramData\NKDentalSoft\logs"
$bootLog = Join-Path $logDir "install_autostart.log"

function Write-Boot([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  Write-Host $line
  try {
    if (-not (Test-Path $logDir)) {
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -Path $bootLog -Value $line -Encoding UTF8
  } catch {}
}

if (-not (Test-Path $exe)) {
  throw "Server exe not found: $exe"
}

Write-Boot "[desktop] InstallDir=$InstallDir"

# CRITICAL: run stop_for_upgrade in a *child* powershell.exe.
# Calling it with & and its internal `exit` would terminate THIS script early
# (or propagate exit 2 when Defender locks the fresh EXE) and skip Start-Process.
if (Test-Path $stopScript) {
  Write-Boot "[desktop] Stopping previous instance (child process, SkipWritableCheck)..."
  $stop = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $stopScript,
    "-Port", "8001",
    "-SkipWritableCheck"
  ) -Wait -PassThru -WindowStyle Hidden
  Write-Boot "[desktop] stop_for_upgrade exit=$($stop.ExitCode)"
} else {
  Write-Boot "[desktop] stop_for_upgrade.ps1 missing — killing by name only"
  Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  cmd /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"
}

try { & $exe stop 2>$null } catch {}
try { & $exe remove 2>$null } catch {}
sc.exe stop NKDentalSoftServer 2>$null | Out-Null
sc.exe delete NKDentalSoftServer 2>$null | Out-Null

# Remove loose modules that shadowed the embedded PYZ
@(
  (Join-Path $InstallDir "server_entry.py"),
  (Join-Path $InstallDir "_internal\server_entry.py"),
  (Join-Path $InstallDir "windows_service.py"),
  (Join-Path $InstallDir "_internal\windows_service.py")
) | ForEach-Object {
  if (Test-Path $_) {
    Remove-Item $_ -Force -ErrorAction SilentlyContinue
    Write-Boot "[desktop] Removed shadow module $_"
  }
}

Start-Sleep -Seconds 2

$taskName = "NKDentalSoft Server"
Write-Boot "[desktop] Registering Scheduled Task '$taskName' (ONLOGON)..."
schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null

# Run as current interactive user at logon — avoids Session-0 zombie service
$tr = "`"$exe`" --foreground"
schtasks.exe /Create /TN $taskName /TR $tr /SC ONLOGON /RL LIMITED /F
if ($LASTEXITCODE -ne 0) {
  Write-Boot "[desktop] WARNING: schtasks create failed exit=$LASTEXITCODE (continuing with Start-Process)"
} else {
  Write-Boot "[desktop] Scheduled Task registered"
}

function Test-PortOpen([int]$Port = 8001) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect("127.0.0.1", $Port)
    $tcp.Close()
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

# Start now (up to 2 attempts — AV first-scan can delay first launch)
$ok = $false
for ($attempt = 1; $attempt -le 2; $attempt++) {
  if (Test-PortOpen) {
    Write-Boot "[desktop] Port 8001 already listening (attempt $attempt)"
    $ok = $true
    break
  }
  Start-ServerHidden
  # Match desktop waiter (~30s); first post-install launch can be slow under Defender
  for ($i = 1; $i -le 60; $i++) {
    if (Test-PortOpen) {
      Write-Boot "[desktop] Port 8001 open after $($i * 0.5)s (attempt $attempt)"
      $ok = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if ($ok) { break }
  Write-Boot "[desktop] Attempt $attempt timed out — retrying"
  cmd /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"
  Start-Sleep -Seconds 2
}

if (-not $ok) {
  $hint = "See $bootLog and $env:SystemDrive\ProgramData\NKDentalSoft\logs\startup.log"
  throw "Server did not open TCP 8001 after install start. $hint"
}

Write-Boot "[desktop] OK — http://127.0.0.1:8001/ is listening"
exit 0
