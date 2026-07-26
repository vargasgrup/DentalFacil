# Build N&K DentalSoft Server: PyInstaller onedir + NSIS installer.
# Requires: Python 3.12+, NSIS 3 (makensis), deps from backend/requirements.txt + pyinstaller + pywin32.

param(
    [switch]$SkipNsis,
    [switch]$SkipDeps
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Backend = Join-Path $Root "backend"
$ServerPkg = Join-Path $Root "packaging\server"
$DistServer = Join-Path $ServerPkg "dist\nkdentalsoft-server"
$OutDir = Join-Path $Root "dist"
$Venv = Join-Path $Root ".venv-build"

function Find-Python312 {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "C:\Program Files\Python312\python.exe",
        "C:\Python312\python.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        try {
            $p = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
            if ($p -and (Test-Path $p.Trim())) { return $p.Trim() }
        } catch {}
    }
    throw "Python 3.12 no encontrado. Instale: winget install Python.Python.3.12"
}

function Find-Makensis {
    $candidates = @(
        "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
        "$env:ProgramFiles\NSIS\makensis.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    $cmd = Get-Command makensis -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "makensis no encontrado. Instale: winget install NSIS.NSIS"
}

Write-Host "==> Python build interpreter"
$Python = Find-Python312
Write-Host "    $Python"

if (-not (Test-Path $Venv)) {
    Write-Host "==> Creating venv at $Venv"
    & $Python -m venv $Venv
}

$VenvPython = Join-Path $Venv "Scripts\python.exe"
$VenvPip = Join-Path $Venv "Scripts\pip.exe"

if (-not $SkipDeps) {
    Write-Host "==> Installing backend + packaging deps"
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r (Join-Path $Backend "requirements.txt")
    & $VenvPython -m pip install pyinstaller pywin32
}

Write-Host "==> Regenerating brand icons (if Recursos available)"
& $VenvPython (Join-Path $Root "packaging\scripts\generate_icons.py")

Write-Host "==> PyInstaller onedir"
Push-Location $Root
try {
    & $VenvPython -m PyInstaller `
        (Join-Path $ServerPkg "pyinstaller.spec") `
        --noconfirm `
        --distpath (Join-Path $ServerPkg "dist") `
        --workpath (Join-Path $ServerPkg "build")
} finally {
    Pop-Location
}

if (-not (Test-Path (Join-Path $DistServer "nkdentalsoft-server.exe"))) {
    throw "PyInstaller no generó nkdentalsoft-server.exe en $DistServer"
}

# Ship service wrapper + post-install scripts beside the onedir tree
Copy-Item (Join-Path $ServerPkg "windows_service.py") $DistServer -Force
Copy-Item (Join-Path $ServerPkg "server_entry.py") $DistServer -Force
$ScriptsDest = Join-Path $DistServer "scripts"
New-Item -ItemType Directory -Force -Path $ScriptsDest | Out-Null
Copy-Item (Join-Path $ServerPkg "scripts\*") $ScriptsDest -Force

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not $SkipNsis) {
    Write-Host "==> NSIS installer"
    $Makensis = Find-Makensis
    & $Makensis (Join-Path $ServerPkg "installer.nsi")
    if ($LASTEXITCODE -ne 0) {
        throw "makensis failed with exit code $LASTEXITCODE"
    }
    $Setup = Join-Path $Root "dist\NKDentalSoft-Server-Setup-x64.exe"
    if (-not (Test-Path $Setup)) {
        throw "Installer not found at $Setup"
    }
    Write-Host "OK Server installer: $Setup"
    Get-Item $Setup | Format-List Name, Length, LastWriteTime
} else {
    Write-Host "Skip NSIS. Onedir listo en: $DistServer"
}

Write-Host "Done."
