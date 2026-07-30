# Build standalone cleaner EXE into repo dist/
# ASCII-only. Does not touch LAN connection sources.

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$packaging = Split-Path $here -Parent
$root = Split-Path $packaging -Parent
$nsi = Join-Path $packaging "clean\cleaner.nsi"
$outDir = Join-Path $root "dist"
$ps1 = Join-Path $here "clean_all_installs.ps1"

function Find-Makensis {
  foreach ($c in @(
      "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
      "$env:ProgramFiles\NSIS\makensis.exe"
    )) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  $cmd = Get-Command makensis -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Copy-Item -LiteralPath $ps1 -Destination (Join-Path $outDir "clean_all_installs.ps1") -Force

# Dist-local BAT: same folder as clean_all_installs.ps1
$distBatPath = Join-Path $outDir "Limpiar-Instalaciones-NKDentalSoft.bat"
$distBatLines = @(
  '@echo off',
  'REM Dist launcher - limpia instalaciones N&K DentalSoft (Admin).',
  'setlocal',
  'cd /d "%~dp0"',
  'set "EXTRA="',
  'if /I "%~1"=="/wipe" set "EXTRA=-WipeClinicData"',
  'net session >nul 2>&1',
  'if errorlevel 1 (',
  '  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath ''%ComSpec%'' -Verb RunAs -ArgumentList ''/c \"\"%~f0\" %* & pause\"''"',
  '  exit /b 0',
  ')',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0clean_all_installs.ps1" %EXTRA%',
  'echo.',
  'pause'
)
Set-Content -LiteralPath $distBatPath -Value $distBatLines -Encoding ASCII

$makensis = Find-Makensis
if (-not $makensis) {
  Write-Host "makensis not found - BAT/PS1 copied to dist\ (no EXE)."
  Write-Host "OK: $distBatPath"
  exit 0
}

Write-Host "==> NSIS cleaner"
Push-Location (Join-Path $packaging "clean")
try {
  & $makensis "/V2" "cleaner.nsi"
  if ($LASTEXITCODE -ne 0) { throw "makensis failed: $LASTEXITCODE" }
} finally {
  Pop-Location
}

$exe = Join-Path $outDir "NKDentalSoft-Clean-All-x64.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "Cleaner EXE missing: $exe" }

$sign = Join-Path $here "sign_windows_exe.ps1"
if (Test-Path -LiteralPath $sign) {
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $sign -Path $exe
  } catch {
    Write-Host ("[sign] skipped: " + $_.Exception.Message)
  }
}

Write-Host ("OK Cleaner: " + $exe)
Get-Item $exe, $distBatPath | Format-Table Name, Length, LastWriteTime
