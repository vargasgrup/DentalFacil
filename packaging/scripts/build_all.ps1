# Build both Windows installers into repo dist/
# Client: always NSIS + ConnectClinic (clinic-verified). Do not build Tauri here.
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
& powershell -ExecutionPolicy Bypass -File (Join-Path $here "build_server.ps1") @args
if ($LASTEXITCODE -ne 0) { throw "build_server.ps1 failed ($LASTEXITCODE)" }
& powershell -ExecutionPolicy Bypass -File (Join-Path $here "build_client.ps1") -ForceNsis
if ($LASTEXITCODE -ne 0) { throw "build_client.ps1 failed ($LASTEXITCODE)" }
Write-Host "Artifacts in ..\..\dist\"
Get-ChildItem (Join-Path $here "..\..\dist\*.exe") | Format-Table Name, Length, LastWriteTime
