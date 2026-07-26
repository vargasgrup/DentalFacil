# Sign Windows EXEs with Authenticode (ASCII-only).
# Prefers commercial PFX via env:
#   NKDENTALSOFT_CODE_SIGN_PFX, NKDENTALSOFT_CODE_SIGN_PASSWORD
# Otherwise creates/uses a local "N&K DentalSoft Code Signing" cert.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$Path
)

$ErrorActionPreference = "Stop"
$CertSubject = "CN=NK DentalSoft Code Signing"

function Find-SignTool {
  $kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  if (Test-Path $kits) {
    $found = Get-ChildItem $kits -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "signtool.exe not found. Install Windows SDK 10."
}

function Get-CodeSignThumbprint {
  $pfx = $env:NKDENTALSOFT_CODE_SIGN_PFX
  if ($pfx -and (Test-Path -LiteralPath $pfx)) {
    return $null  # caller uses PFX path
  }

  $cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq $CertSubject -and $_.NotAfter -gt (Get-Date) } |
    Select-Object -First 1

  if (-not $cert) {
    Write-Host "[sign] Creating local code-signing certificate: $CertSubject"
    $cert = New-SelfSignedCertificate `
      -Type CodeSigningCert `
      -Subject $CertSubject `
      -KeyExportPolicy Exportable `
      -KeySpec Signature `
      -KeyLength 2048 `
      -HashAlgorithm SHA256 `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -NotAfter (Get-Date).AddYears(5)

    $cer = Join-Path $env:TEMP "nkds-codesign.cer"
    Export-Certificate -Cert $cert -FilePath $cer | Out-Null
    try {
      Import-Certificate -FilePath $cer -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
      Import-Certificate -FilePath $cer -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null
    } catch {
      Write-Host "[sign] NOTE: trust import: $($_.Exception.Message)"
    }
  }
  return $cert.Thumbprint
}

$signtool = Find-SignTool
$pfx = $env:NKDENTALSOFT_CODE_SIGN_PFX
$plain = $env:NKDENTALSOFT_CODE_SIGN_PASSWORD
$thumb = $null
if (-not ($pfx -and (Test-Path -LiteralPath $pfx))) {
  $thumb = Get-CodeSignThumbprint
}
$ts = "http://timestamp.digicert.com"

foreach ($p in $Path) {
  if (-not (Test-Path -LiteralPath $p)) {
    throw "File not found: $p"
  }
  Write-Host "[sign] Signing $p"
  if ($pfx -and (Test-Path -LiteralPath $pfx)) {
    & $signtool sign /f $pfx /p $plain /fd SHA256 /td SHA256 /tr $ts /v $p
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[sign] Timestamp failed - retry without /tr"
      & $signtool sign /f $pfx /p $plain /fd SHA256 /v $p
    }
  } else {
    & $signtool sign /sha1 $thumb /fd SHA256 /td SHA256 /tr $ts /v $p
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[sign] Timestamp failed - retry without /tr"
      & $signtool sign /sha1 $thumb /fd SHA256 /v $p
    }
  }
  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed for $p (exit $LASTEXITCODE)"
  }
  $status = (Get-AuthenticodeSignature -FilePath $p).Status
  Write-Host "[sign] Status=$status  Subject=$((Get-AuthenticodeSignature -FilePath $p).SignerCertificate.Subject)"
}

Write-Host "[sign] Done."
