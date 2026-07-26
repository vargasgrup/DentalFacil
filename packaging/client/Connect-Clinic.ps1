# Ask for clinic Server URL and open Edge in app mode (ASCII-only).
param(
  [switch]$ForcePrompt
)

$ErrorActionPreference = "Stop"
$cfgDir = Join-Path $env:LOCALAPPDATA "NKDentalSoft"
$cfgFile = Join-Path $cfgDir "client-url.txt"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null

$url = ""
if (-not $ForcePrompt -and (Test-Path -LiteralPath $cfgFile)) {
  $url = (Get-Content -LiteralPath $cfgFile -Raw -ErrorAction SilentlyContinue).Trim()
}

if (-not $url) {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $url = [Microsoft.VisualBasic.Interaction]::InputBox(
    "URL del servidor principal (misma red Wi-Fi/LAN).`r`nEjemplo: http://192.168.1.10:8001",
    "N&K DentalSoft Client",
    "http://192.168.1.10:8001"
  )
  if (-not $url) { exit 0 }
  $url = $url.Trim().TrimEnd("/")
  if ($url -and ($url -notmatch "^https?://")) {
    $url = "http://" + $url
  }
  Set-Content -LiteralPath $cfgFile -Value $url -Encoding ASCII
}

function Find-Edge {
  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return $null
}

$edge = Find-Edge
if ($edge) {
  Start-Process -FilePath $edge -ArgumentList @("--app=$url", "--new-window")
} else {
  Start-Process $url
}
