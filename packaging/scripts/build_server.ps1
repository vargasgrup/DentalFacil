# Build N&K DentalSoft Server: PyInstaller onedir + NSIS installer.
# Requires: Python 3.12+, NSIS 3 (makensis), Node 20+ for UI embed, pyinstaller + pywin32.

param(
    [switch]$SkipNsis,
    [switch]$SkipDeps,
    [switch]$SkipFrontend
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

if (-not $SkipDeps) {
    Write-Host "==> Installing backend + packaging deps"
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r (Join-Path $Backend "requirements.txt")
    & $VenvPython -m pip install pyinstaller pywin32
}

Write-Host "==> Regenerating brand icons (if Recursos available)"
& $VenvPython (Join-Path $Root "packaging\scripts\generate_icons.py")

if (-not $SkipFrontend) {
    Write-Host "==> Next.js static export (embed UI in server)"
    $Frontend = Join-Path $Root "frontend"
    Push-Location $Frontend
    try {
        if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        }
        & npm run build:desktop
        if ($LASTEXITCODE -ne 0) { throw "npm run build:desktop failed" }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path (Join-Path $Frontend "out\index.html"))) {
        throw "frontend/out/index.html missing after static export"
    }
} elseif (-not (Test-Path (Join-Path $Root "frontend\out\index.html"))) {
    Write-Warning "SkipFrontend set and frontend/out missing - server build will be API-only"
}

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
    throw "PyInstaller did not produce nkdentalsoft-server.exe in $DistServer"
}

Copy-Item (Join-Path $ServerPkg "windows_service.py") $DistServer -Force
Copy-Item (Join-Path $ServerPkg "server_entry.py") $DistServer -Force
Copy-Item (Join-Path $ServerPkg "Start-Server.bat") $DistServer -Force
$ScriptsDest = Join-Path $DistServer "scripts"
New-Item -ItemType Directory -Force -Path $ScriptsDest | Out-Null
Copy-Item (Join-Path $ServerPkg "scripts\*") $ScriptsDest -Force

# Ensure web/ sits next to the exe (PyInstaller also embeds under _internal)
$WebSrc = Join-Path $Root "frontend\out"
$WebDest = Join-Path $DistServer "web"
if (Test-Path (Join-Path $WebSrc "index.html")) {
    if (Test-Path $WebDest) { Remove-Item $WebDest -Recurse -Force }
    Copy-Item $WebSrc $WebDest -Recurse -Force
    Write-Host "==> Copied UI to $WebDest"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if (-not $SkipNsis) {
    Write-Host "==> NSIS installer"
    $Makensis = Find-Makensis
    $Setup = Join-Path $Root "dist\NKDentalSoft-Server-Setup-x64.exe"
    $SetupBuild = Join-Path $Root "dist\NKDentalSoft-Server-Setup-x64.build.exe"
    # Write to .build.exe first so a locked previous Setup does not abort makensis
    $nsi = Get-Content (Join-Path $ServerPkg "installer.nsi") -Raw
    $nsiBuild = $nsi -replace 'OutFile\s+"[^"]+"', 'OutFile "..\..\dist\NKDentalSoft-Server-Setup-x64.build.exe"'
    $nsiTmp = Join-Path $ServerPkg "installer.build.nsi"
    Set-Content -Path $nsiTmp -Value $nsiBuild -Encoding UTF8
    try {
        & $Makensis $nsiTmp
        if ($LASTEXITCODE -ne 0) {
            throw "makensis failed with exit code $LASTEXITCODE"
        }
        if (-not (Test-Path $SetupBuild)) {
            throw "Installer build output missing: $SetupBuild"
        }
        if (Test-Path $Setup) {
            Remove-Item $Setup -Force -ErrorAction SilentlyContinue
        }
        Move-Item $SetupBuild $Setup -Force
    } finally {
        Remove-Item $nsiTmp -Force -ErrorAction SilentlyContinue
        Remove-Item $SetupBuild -Force -ErrorAction SilentlyContinue
    }
    if (-not (Test-Path $Setup)) {
        throw "Installer not found at $Setup"
    }
    Write-Host "OK Server installer: $Setup"
    Get-Item $Setup | Format-List Name, Length, LastWriteTime
} else {
    Write-Host "Skip NSIS. Onedir ready at: $DistServer"
}

Write-Host "Done."
