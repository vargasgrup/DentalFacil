# Build both Windows installers into repo dist/
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
& powershell -ExecutionPolicy Bypass -File (Join-Path $here "build_server.ps1") @args
& powershell -ExecutionPolicy Bypass -File (Join-Path $here "build_client.ps1") -SkipInstallCli
Write-Host "Artifacts in ..\..\dist\"
Get-ChildItem (Join-Path $here "..\..\dist\*.exe") | Format-Table Name, Length, LastWriteTime
