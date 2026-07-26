# Post-install healthcheck — verify API + embedded UI after Server setup.
param(
  [string]$BaseUrl = "http://127.0.0.1:8001",
  [string]$HttpsUrl = "https://127.0.0.1:8001",
  [int]$Retries = 40,
  [int]$DelaySeconds = 2
)

$ErrorActionPreference = "Continue"

function Trust-LocalCerts {
  try {
    add-type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p) { return true; }
}
"@
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
  } catch {}
}

function Try-Get([string]$Url) {
  try {
    return Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 5 -UseBasicParsing
  } catch {
    return $null
  }
}

Trust-LocalCerts

$bases = @($BaseUrl, $HttpsUrl)
$ok = $false

for ($i = 1; $i -le $Retries; $i++) {
  foreach ($base in $bases) {
    $healthUrl = "$base/api/system/health"
    $uiRootUrl = "$base/api/system/ui-root"
    $homeUrl = "$base/"

    try {
      $health = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 5
    } catch {
      Write-Host "Attempt $i/$Retries [$base] health: $($_.Exception.Message)"
      continue
    }

    if ($health.app_env -ne "production") {
      Write-Warning "APP_ENV is '$($health.app_env)' — expected production (continuing UI checks)"
    }

    $uiMounted = $false
    if ($health.PSObject.Properties.Name -contains "ui_mounted") {
      $uiMounted = [bool]$health.ui_mounted
    }

    try {
      $uiInfo = Invoke-RestMethod -Uri $uiRootUrl -Method GET -TimeoutSec 5
      if ($uiInfo.index) { $uiMounted = $true }
      Write-Host "ui-root: $($uiInfo.ui_root) index=$($uiInfo.index)"
    } catch {
      Write-Host "ui-root probe failed: $($_.Exception.Message)"
    }

    $home = Try-Get $homeUrl
    $homeOk = $false
    if ($home -ne $null) {
      $ctype = [string]$home.Headers["Content-Type"]
      $snippet = ([string]$home.Content).Substring(0, [Math]::Min(80, ([string]$home.Content).Length))
      Write-Host "GET / => $($home.StatusCode) $ctype :: $snippet"
      if ($home.StatusCode -eq 200 -and ($ctype -match "text/html" -or $snippet -match "<!DOCTYPE|<html")) {
        $homeOk = $true
      }
      if ($snippet -match '"detail"\s*:\s*"Not Found"') {
        Write-Error "Homepage still returns FastAPI JSON Not Found — UI mount failed"
        exit 1
      }
    }

    if ($homeOk -or $uiMounted) {
      Write-Host "Post-install OK: status=$($health.status) version=$($health.version) ui=$homeOk"
      $ok = $true
      break
    }

    Write-Host "Attempt $i/$Retries: API up but UI not mounted yet"
  }
  if ($ok) { exit 0 }
  Start-Sleep -Seconds $DelaySeconds
}

Write-Error "Server did not serve embedded UI. Check Program Files\NKDentalSoft\Server\web\index.html and startup.log"
exit 1
