# Allow local N&K DentalSoft installers on this PC (ASCII-only).
# 1) Removes Mark-of-the-Web
# 2) Turns OFF Smart App Control Enforcement (requires Administrator)
#    SAC Enforcement blocks unsigned / no-reputation EXEs that used to run in Evaluation.
#
# Run as Administrator once on the clinic server PC.

#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"

$dist = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "dist"
$exes = @(
  (Join-Path $dist "NKDentalSoft-Server-Setup-x64.exe"),
  (Join-Path $dist "NKDentalSoft-Client-Setup-x64.exe")
) | Where-Object { Test-Path -LiteralPath $_ }

foreach ($e in $exes) {
  try {
    Unblock-File -LiteralPath $e -ErrorAction SilentlyContinue
    # Clear Zone.Identifier if present
    $ads = $e + ":Zone.Identifier"
    if (Test-Path -LiteralPath $ads) {
      Remove-Item -LiteralPath $ads -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[allow] Unblocked $e"
  } catch {
    Write-Host "[allow] Unblock note: $($_.Exception.Message)"
  }
}

$pol = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
if (-not (Test-Path $pol)) {
  New-Item -Path $pol -Force | Out-Null
}

$current = (Get-ItemProperty -Path $pol -Name VerifiedAndReputablePolicyState -ErrorAction SilentlyContinue).VerifiedAndReputablePolicyState
Write-Host "[allow] Smart App Control state was: $current  (0=Off 1=Enforce 2=Evaluation)"

# 0 = Off (required for unsigned clinic installers without Microsoft reputation)
Set-ItemProperty -Path $pol -Name VerifiedAndReputablePolicyState -Value 0 -Type DWord -Force
$after = (Get-ItemProperty -Path $pol -Name VerifiedAndReputablePolicyState).VerifiedAndReputablePolicyState
Write-Host "[allow] Smart App Control state now: $after"

Write-Host ""
Write-Host "Listo. Cierre el aviso de Windows, reinicie el PC si el Setup sigue bloqueado,"
Write-Host "y ejecute de nuevo:"
Write-Host "  $dist\NKDentalSoft-Server-Setup-x64.exe"
Write-Host ""
Write-Host "NOTA: Desactivar Smart App Control es permanente en esta instalacion de Windows"
Write-Host "(Microsoft no permite reactivarlo facilmente). Normal en PCs de clinica con software propio."
pause
