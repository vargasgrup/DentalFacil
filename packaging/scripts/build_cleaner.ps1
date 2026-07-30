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

# Dist-local BAT: same folder as clean_all_installs.ps1 (full wipe)
$distBatPath = Join-Path $outDir "Limpiar-Instalaciones-NKDentalSoft.bat"
$distBatLines = @(
  '@echo off',
  'REM Desinstalacion / limpieza TOTAL N&K DentalSoft (Admin).',
  'REM Log: Escritorio\NKDentalSoft-limpia.log',
  'setlocal',
  'cd /d "%~dp0"',
  'set "PS1=%~dp0clean_all_installs.ps1"',
  'if not exist "%PS1%" (',
  '  echo No se encontro clean_all_installs.ps1',
  '  pause',
  '  exit /b 1',
  ')',
  'echo.',
  'echo  N^&K DentalSoft - DESINSTALACION / LIMPIEZA TOTAL',
  'echo  Se borraran Server, Client y datos en ProgramData.',
  'echo.',
  'net session >nul 2>&1',
  'if errorlevel 1 (',
  '  echo Solicitando Administrador...',
  '  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath ''powershell.exe'' -Verb RunAs -ArgumentList ''-NoProfile -ExecutionPolicy Bypass -File \"\"%PS1%\"\" -NoElevate'' -Wait"',
  '  echo Revise NKDentalSoft-limpia.log en el Escritorio.',
  '  pause',
  '  exit /b 0',
  ')',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -NoElevate',
  'set "RC=%ERRORLEVEL%"',
  'echo Codigo=%RC%  Log: Escritorio\NKDentalSoft-limpia.log',
  'pause',
  'exit /b %RC%'
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
