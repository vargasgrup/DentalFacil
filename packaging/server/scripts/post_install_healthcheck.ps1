# Post-install healthcheck — API + embedded UI over HTTP (desktop mode).
param(
  [string]$BaseUrl = "http://127.0.0.1:8001",
  [string]$InstallDir = "",
  [int]$Retries = 90,
  [int]$DelaySeconds = 2
)

$ErrorActionPreference = "Continue"

$expectedBuild = $null
if ($InstallDir) {
  $bid = Join-Path $InstallDir "BUILD_ID"
  if (Test-Path -LiteralPath $bid) {
    $expectedBuild = (Get-Content -LiteralPath $bid -Raw -ErrorAction SilentlyContinue).Trim()
  }
}

for ($i = 1; $i -le $Retries; $i++) {
  try {
    $home = Invoke-WebRequest -Uri "$BaseUrl/" -Method GET -TimeoutSec 5 -UseBasicParsing
    $health = Invoke-RestMethod -Uri "$BaseUrl/api/system/health" -Method GET -TimeoutSec 5
    $ctype = [string]$home.Headers["Content-Type"]
    $snippet = ([string]$home.Content).Substring(0, [Math]::Min(60, ([string]$home.Content).Length))
    Write-Host "GET / => $($home.StatusCode) $ctype :: $snippet"
    if ($snippet -match '"detail"\s*:\s*"Not Found"') {
      Write-Error "Homepage still returns FastAPI JSON Not Found"
      exit 1
    }
    if ($home.StatusCode -eq 200 -and ($ctype -match "text/html" -or $snippet -match "<!DOCTYPE|<html")) {
      try {
        $ui = Invoke-RestMethod -Uri "$BaseUrl/api/system/ui-root" -Method GET -TimeoutSec 5
        Write-Host ("ui-root build_id=" + $ui.build_id + " dir=" + $ui.ui_root)
        if ($expectedBuild -and $ui.build_id -and ($ui.build_id -ne $expectedBuild)) {
          Write-Host "WARNING: running build_id differs from install BUILD_ID (cache or dual install?)"
          Write-Host ("  disk=" + $expectedBuild + " runtime=" + $ui.build_id)
        }
      } catch {
        Write-Host "ui-root probe skipped: $($_.Exception.Message)"
      }
      Write-Host "Post-install OK: status=$($health.status) version=$($health.version) ui=True"
      exit 0
    }
  } catch {
    Write-Host "Attempt $i/$Retries failed: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $DelaySeconds
}

Write-Error "Server did not serve UI at $BaseUrl — run scripts\repair_startup.cmd as Administrator"
exit 1
