# Build N&K DentalSoft Client (Tauri NSIS).
# Requires: Rust (rustup), WebView2, cargo-tauri 2.

param(
    [switch]$SkipInstallCli
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$SrcTauri = Join-Path $Root "packaging\client\src-tauri"
$OutDir = Join-Path $Root "dist"
$TargetDir = Join-Path $SrcTauri "target"

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" +
            (Join-Path $env:USERPROFILE ".cargo\bin")

# Keep artifacts inside the repo (not Cursor sandbox cargo cache)
$env:CARGO_TARGET_DIR = $TargetDir

$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargo) {
    throw "Rust/cargo no encontrado. Instale: winget install Rustlang.Rustup"
}

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

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

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

$candidates = @(
    (Join-Path $TargetDir "release\bundle\nsis"),
    (Join-Path $env:CARGO_TARGET_DIR "release\bundle\nsis")
)
$found = $false
foreach ($bundle in $candidates) {
    if (-not (Test-Path $bundle)) { continue }
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

Write-Host "Done."
