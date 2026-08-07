# Write PRODUCT build identity next to server payload and UI export.
# Used so upgrades always replace stale web/ even when file mtimes are wrong.
param(
  [Parameter(Mandatory = $true)]
  [string]$ServerDistDir,
  [string]$FrontendOutDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$stamp = Get-Date -Format "yyyyMMdd.HHmmss"
$git = ""
try {
  $git = (& git -C $Root rev-parse --short HEAD 2>$null)
  if ($git) { $git = $git.Trim() }
} catch {}
$id = if ($git) { "$stamp+$git" } else { $stamp }
$meta = @(
  "build_id=$id",
  "built_at=$(Get-Date -Format o)",
  "product=NKDentalSoft-Server"
) -join "`n"

$targets = @(
  (Join-Path $ServerDistDir "BUILD_ID"),
  (Join-Path $ServerDistDir "web\BUILD_ID"),
  (Join-Path $ServerDistDir "_internal\web\BUILD_ID")
)
if ($FrontendOutDir -and (Test-Path -LiteralPath $FrontendOutDir)) {
  $targets += (Join-Path $FrontendOutDir "BUILD_ID")
}

foreach ($t in $targets) {
  $dir = Split-Path -Parent $t
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  Set-Content -LiteralPath $t -Value $id -Encoding ascii -NoNewline
  Write-Host "Wrote $t => $id"
}

# Human-readable sidecar for support
Set-Content -LiteralPath (Join-Path $ServerDistDir "PRODUCT_BUILD.txt") -Value $meta -Encoding UTF8
Write-Host "BUILD_ID=$id"
