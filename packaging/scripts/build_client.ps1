# Build N&K DentalSoft Client installer.
# Prefer Tauri (Rust) when Windows Application Control allows it;
# otherwise build a LAN Client NSIS package (Edge --app) that works with HTTP Server.

param(
    [switch]$SkipInstallCli,
    [switch]$ForceNsis
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ClientPkg = Join-Path $Root "packaging\client"
$SrcTauri = Join-Path $ClientPkg "src-tauri"
$OutDir = Join-Path $Root "dist"
$TargetDir = Join-Path $env:LOCALAPPDATA "cargo-targets\nkdentalsoft-client"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" +
            (Join-Path $env:USERPROFILE ".cargo\bin")

function Find-Makensis {
    $candidates = @(
        "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
        "$env:ProgramFiles\NSIS\makensis.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    throw "makensis.exe no encontrado. Instale NSIS 3."
}

function Build-NsisClient {
    Write-Host "==> Building LAN Client (NSIS / Edge app mode)"
    $makensis = Find-Makensis
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
    Push-Location $ClientPkg
    try {
        & $makensis "installer.nsi"
        if ($LASTEXITCODE -ne 0) { throw "makensis failed ($LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    $setup = Join-Path $OutDir "NKDentalSoft-Client-Setup-x64.exe"
    if (-not (Test-Path $setup)) {
        throw "Client Setup missing: $setup"
    }
    Get-Item $setup | Format-List Name, Length, LastWriteTime
    Write-Host "OK Client installer: $setup"
}

function Build-TauriClient {
    Write-Host "==> Regenerating brand icons"
    $py = Get-Command python -ErrorAction SilentlyContinue
    if ($py) {
        & python (Join-Path $Root "packaging\scripts\generate_icons.py")
    }

    if (-not $SkipInstallCli) {
        Write-Host "==> Ensuring tauri-cli 2"
        & cargo install tauri-cli --version "^2" --locked
        if ($LASTEXITCODE -ne 0) {
            & cargo install tauri-cli --version "^2"
        }
    }

    New-Item -ItemType Directory -Force -Path $OutDir, $TargetDir | Out-Null
    $env:CARGO_TARGET_DIR = $TargetDir
    Write-Host "CARGO_TARGET_DIR=$TargetDir"
    Write-Host "==> cargo tauri build"
    Push-Location $SrcTauri
    try {
        & cargo tauri build
        if ($LASTEXITCODE -ne 0) {
            throw "cargo tauri build failed ($LASTEXITCODE)"
        }
    } finally {
        Pop-Location
    }

    $bundle = Join-Path $TargetDir "release\bundle\nsis"
    $found = $false
    if (Test-Path $bundle) {
        Get-ChildItem $bundle -Filter "*.exe" | ForEach-Object {
            Copy-Item $_.FullName (Join-Path $OutDir $_.Name) -Force
            Copy-Item $_.FullName (Join-Path $OutDir "NKDentalSoft-Client-Setup-x64.exe") -Force
            Write-Host ("OK Client installer: " + $_.FullName)
            $found = $true
        }
    }
    if (-not $found) {
        throw "No NSIS client bundle found under $TargetDir"
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ($ForceNsis) {
    Build-NsisClient
    Write-Host "Done."
    exit 0
}

try {
    Build-TauriClient
} catch {
    Write-Host "WARNING: Tauri build failed ($($_.Exception.Message))"
    Write-Host "Falling back to NSIS LAN Client (recommended while WDAC blocks Rust build scripts)."
    Build-NsisClient
}

Write-Host "Done."
