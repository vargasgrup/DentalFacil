# Rename locked server EXE so NSIS can overwrite (ASCII-only).
param(
  [string]$InstallDir = $(Join-Path $env:ProgramFiles "NKDentalSoft\Server")
)

$ErrorActionPreference = "Continue"
$exe = Join-Path $InstallDir "nkdentalsoft-server.exe"

Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
& cmd.exe /c "taskkill /F /IM nkdentalsoft-server.exe /T >nul 2>&1"
Start-Sleep -Seconds 1

if (Test-Path -LiteralPath $exe) {
  $bak = Join-Path $InstallDir ("nkdentalsoft-server.exe.old_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
  try {
    Move-Item -LiteralPath $exe -Destination $bak -Force
    Write-Host "[upgrade] Renamed locked EXE to $bak"
  } catch {
    Write-Host "[upgrade] Rename failed: $($_.Exception.Message)"
    exit 1
  }
}
exit 0
