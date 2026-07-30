# Build both Windows installers into repo dist/
# Client: always NSIS + ConnectClinic (clinic-verified). Do not build Tauri here.
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
& powershell -ExecutionPolicy Bypass -File (Join-Path $here "build_server.ps1") @args
& powershell -ExecutionPolicy Bypass -File (Join-Path $here "build_client.ps1") -ForceNsis
Write-Host "Artifacts in ..\..\dist\"
Get-ChildItem (Join-Path $here "..\..\dist\*.exe") | Format-Table Name, Length, LastWriteTime
