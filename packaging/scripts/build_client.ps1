# Build N&K DentalSoft Client installer.
# Docs: packaging/README.md
# LAN connection stack is FROZEN (verified). Official path: -ForceNsis (ConnectClinic + NSIS).
# See .cursor/rules/lan-client-server-freeze.mdc
# Default = NSIS ConnectClinic. Tauri only with -UseTauri (optional / not for clinic).

param(
    [switch]$SkipInstallCli,
    [switch]$ForceNsis,
    [switch]$UseTauri
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
    Write-Host "==> Compiling native ConnectClinic.exe"
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build_client_connector.ps1")
    if ($LASTEXITCODE -ne 0) { throw "build_client_connector failed ($LASTEXITCODE)" }

    $connector = Join-Path $ClientPkg "ConnectClinic.exe"
    if (-not (Test-Path $connector)) { throw "ConnectClinic.exe missing after compile" }
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "packaging\scripts\sign_windows_exe.ps1") -Path $connector
    } catch {
        Write-Host "WARNING: connector signing skipped: $($_.Exception.Message)"
    }

    Write-Host "==> Building LAN Client (NSIS / native connector)"
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
    try {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "packaging\scripts\sign_windows_exe.ps1") -Path $setup
    } catch {
        Write-Host "WARNING: client signing skipped: $($_.Exception.Message)"
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

# Official clinic path: ConnectClinic + NSIS (default). Tauri only with -UseTauri.
if ($UseTauri -and -not $ForceNsis) {
    try {
        Build-TauriClient
    } catch {
        Write-Host "WARNING: Tauri build failed ($($_.Exception.Message))"
        Write-Host "Falling back to NSIS LAN Client (clinic-verified)."
        Build-NsisClient
    }
} else {
    if ($UseTauri -and $ForceNsis) {
        Write-Host "NOTE: -ForceNsis wins over -UseTauri; building ConnectClinic NSIS."
    }
    Build-NsisClient
}

Write-Host "Done."
