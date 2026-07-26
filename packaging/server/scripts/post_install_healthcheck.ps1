# Post-install healthcheck — fail install if production env is insecure.
param(
  [string]$BaseUrl = "https://127.0.0.1:8001",
  [int]$Retries = 30,
  [int]$DelaySeconds = 2
)

$ErrorActionPreference = "Stop"
$healthUrl = "$BaseUrl/api/system/health"

for ($i = 1; $i -le $Retries; $i++) {
  try {
    # Self-signed: skip cert validation for local loopback check only
    add-type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p) { return true; }
}
"@
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    $resp = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 5
    if ($resp.app_env -ne "production") {
      Write-Error "APP_ENV is '$($resp.app_env)' — expected production"
      exit 1
    }
    if (-not $resp.jwt_secret_configured) {
      Write-Error "JWT secret not configured securely"
      exit 1
    }
    if ($resp.PSObject.Properties.Name -contains "maintenance_key_configured" -and -not $resp.maintenance_key_configured) {
      Write-Error "MAINTENANCE_ACCESS_KEY not configured securely"
      exit 1
    }
    if ($resp.status -eq "ok" -or $resp.database_connected) {
      Write-Host "Post-install health OK: $($resp.status) version=$($resp.version)"
      exit 0
    }
  } catch {
    Write-Host "Attempt $i/$Retries failed: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $DelaySeconds
}

Write-Error "Server did not become healthy at $healthUrl"
exit 1
