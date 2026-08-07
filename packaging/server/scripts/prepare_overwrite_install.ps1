# Prepare installation directory for in-place upgrade.
# Removes product binaries/UI so NSIS File /r cannot leave mixed old+new trees.
# NEVER touches %ProgramData%\NKDentalSoft (patients, secrets, uploads).
# ASCII-only for Windows PowerShell 5.1.
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,
  [switch]$ClearWebViewCache
)

$ErrorActionPreference = "Continue"
$InstallDir = $InstallDir.Trim().Trim('"').TrimEnd('\')
Write-Host ("[prepare] InstallDir=" + $InstallDir)

if (-not $InstallDir -or -not (Test-Path -LiteralPath $InstallDir)) {
  Write-Host "[prepare] dir missing (first install) - nothing to purge"
  exit 0
}

function Remove-Tree([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Write-Host ("[prepare] Removing " + $Path)
  try {
    Takeown /f $Path /r /d y 2>$null | Out-Null
    icacls $Path /grant Administrators:F /t /c /q 2>$null | Out-Null
  } catch {}
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
  } catch {
    # Locked residual: rename aside so installer creates a fresh path
    $bak = $Path + ".old_" + (Get-Date -Format "yyyyMMdd_HHmmss")
    try {
      Move-Item -LiteralPath $Path -Destination $bak -Force
      Write-Host ("[prepare] Renamed locked tree to " + $bak)
    } catch {
      Write-Host ("[prepare] warn: " + $_.Exception.Message)
    }
  }
}

# Product tree only (not ProgramData clinical data)
@(
  "web",
  "_internal",
  "assets",
  "scripts"
) | ForEach-Object {
  Remove-Tree -Path (Join-Path $InstallDir $_)
}

# Loose exe / modules / previous failed upgrades
Get-ChildItem -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
  $n = $_.Name
  if ($n -match '^(nkdentalsoft-server\.exe|server_entry\.py|windows_service\.py|python.*\.dll|base_library\.zip)$') {
    Write-Host ("[prepare] Removing " + $_.FullName)
    try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop } catch {
      $bak = $_.FullName + ".old_" + (Get-Date -Format "yyyyMMdd_HHmmss")
      try { Move-Item -LiteralPath $_.FullName -Destination $bak -Force } catch {}
    }
  }
  if ($n -like "nkdentalsoft-server.exe.old_*") {
    try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue } catch {}
  }
  if ($n -like "*.old_*") {
    try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch {}
  }
}

if ($ClearWebViewCache) {
  $userRoots = @()
  try {
    Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $userRoots += $_.FullName
    }
  } catch {}
  if ($env:USERPROFILE) { $userRoots += $env:USERPROFILE }
  $userRoots = $userRoots | Select-Object -Unique
  foreach ($u in $userRoots) {
    @(
      (Join-Path $u "AppData\Local\pywebview"),
      (Join-Path $u "AppData\Roaming\pywebview"),
      (Join-Path $u "AppData\Local\NKDentalSoft")
    ) | ForEach-Object {
      if (Test-Path -LiteralPath $_) {
        Write-Host ("[prepare] Clearing WebView cache " + $_)
        try { Remove-Item -LiteralPath $_ -Recurse -Force -ErrorAction SilentlyContinue } catch {}
      }
    }
  }
}

Write-Host "[prepare] Product tree purged - ready for clean File copy."
exit 0
