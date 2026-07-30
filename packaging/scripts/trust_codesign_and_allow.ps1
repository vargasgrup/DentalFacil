# Trust N&K DentalSoft local code-signing cert + unblock Setup EXEs.
# Run as Administrator ONCE on each clinic PC before installing Client/Server.
# ASCII-only (Windows PowerShell 5.1).

param(
  [switch]$NoElevate,
  [string]$CerPath = ""
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not $NoElevate -and -not (Test-IsAdmin)) {
  Write-Host "Solicitando Administrador..."
  $argList = @(
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", $MyInvocation.MyCommand.Path,
    "-NoElevate"
  )
  if ($CerPath) { $argList += @("-CerPath", $CerPath) }
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList -Wait
  exit 0
}

$here = $PSScriptRoot
$dist = $null
foreach ($cand in @(
    $here,
    (Join-Path $here "dist"),
    (Join-Path (Split-Path $here -Parent) "dist"),
    (Join-Path (Split-Path (Split-Path $here -Parent) -Parent) "dist")
  )) {
  if ($cand -and (Test-Path -LiteralPath (Join-Path $cand "NKDentalSoft-Client-Setup-x64.exe"))) {
    $dist = $cand
    break
  }
}
if (-not $dist) {
  if (Test-Path -LiteralPath (Join-Path $here "NKDentalSoft-CodeSigning.cer")) {
    $dist = $here
  } else {
    $dist = Join-Path (Split-Path (Split-Path $here -Parent) -Parent) "dist"
  }
}

if (-not $CerPath) {
  $candidates = @(
    (Join-Path $dist "NKDentalSoft-CodeSigning.cer"),
    (Join-Path $PSScriptRoot "NKDentalSoft-CodeSigning.cer"),
    (Join-Path (Split-Path $PSScriptRoot -Parent) "NKDentalSoft-CodeSigning.cer")
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { $CerPath = $c; break }
  }
}

Write-Host "==> Trust / allow N&K DentalSoft installers"
Write-Host ("    dist=" + $dist)
Write-Host ("    cer =" + $CerPath)

if ($CerPath -and (Test-Path -LiteralPath $CerPath)) {
  Write-Host "[trust] Importing code-signing CER to LocalMachine Root + TrustedPublisher"
  Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
  Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
  Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\CurrentUser\Root" -ErrorAction SilentlyContinue | Out-Null
  Import-Certificate -FilePath $CerPath -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" -ErrorAction SilentlyContinue | Out-Null
  Write-Host "[trust] CER imported OK"
} else {
  Write-Host "[trust] WARN: CER not found. Signing trust skipped."
}

$exes = @(
  (Join-Path $dist "NKDentalSoft-Client-Setup-x64.exe"),
  (Join-Path $dist "NKDentalSoft-Server-Setup-x64.exe"),
  (Join-Path $dist "NKDentalSoft-Clean-All-x64.exe"),
  (Join-Path $PSScriptRoot "NKDentalSoft-Client-Setup-x64.exe"),
  (Join-Path $PSScriptRoot "NKDentalSoft-Server-Setup-x64.exe")
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique

foreach ($e in $exes) {
  try {
    Unblock-File -LiteralPath $e -ErrorAction SilentlyContinue
    $ads = $e + ":Zone.Identifier"
    if (Test-Path -LiteralPath $ads) {
      Remove-Item -LiteralPath $ads -Force -ErrorAction SilentlyContinue
    }
    $sig = Get-AuthenticodeSignature -FilePath $e
    Write-Host ("[allow] " + [IO.Path]::GetFileName($e) + "  Auth=" + $sig.Status + "  Unblocked")
  } catch {
    Write-Host ("[allow] note: " + $_.Exception.Message)
  }
}

$pol = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
if (-not (Test-Path $pol)) { New-Item -Path $pol -Force | Out-Null }
$current = (Get-ItemProperty -Path $pol -Name VerifiedAndReputablePolicyState -ErrorAction SilentlyContinue).VerifiedAndReputablePolicyState
Write-Host ("[allow] Smart App Control was: " + $current + " (0=Off 1=Enforce 2=Evaluation)")
Set-ItemProperty -Path $pol -Name VerifiedAndReputablePolicyState -Value 0 -Type DWord -Force
Write-Host ("[allow] Smart App Control now: " + (Get-ItemProperty -Path $pol -Name VerifiedAndReputablePolicyState).VerifiedAndReputablePolicyState)

Write-Host ""
Write-Host "Listo. Ahora instale:"
Write-Host "  NKDentalSoft-Client-Setup-x64.exe"
Write-Host "Si Windows sigue bloqueando: reinicie el PC y vuelva a ejecutar este asistente."
if (-not $env:CI) {
  Write-Host ""
  Write-Host "Presione Enter para cerrar..."
  try { [void][Console]::ReadLine() } catch { cmd /c pause >nul }
}
