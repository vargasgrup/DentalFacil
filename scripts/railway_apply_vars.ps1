# Aplica variables de docs/RAILWAY_VARS.local.md al proyecto Railway linkeado.
# Uso:
#   railway login
#   railway link   # proyecto DentalSimple / production
#   powershell -File scripts/railway_apply_vars.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $root "docs\RAILWAY_VARS.local.md"
if (-not (Test-Path $local)) {
    Write-Error "Falta $local — copia docs/RAILWAY_VARS.example.md y genera secretos."
}

function Get-VarMap([string]$sectionTitle, [string[]]$lines) {
    $map = [ordered]@{}
    $in = $false
    foreach ($raw in $lines) {
        $line = $raw.Trim()
        if ($line -match "^##\s+$([regex]::Escape($sectionTitle))\b") {
            $in = $true
            continue
        }
        if ($in -and $line -match "^##\s+") { break }
        if (-not $in) { continue }
        if ($line.StartsWith("#") -or -not $line) { continue }
        if ($line -match "^(?<k>[A-Z0-9_]+)=(?<v>.*)$") {
            $map[$Matches.k] = $Matches.v.Trim()
        }
    }
    return $map
}

$lines = Get-Content -Path $local -Encoding UTF8
$backend = Get-VarMap "Backend" $lines
$frontend = Get-VarMap "Frontend" $lines

if ($backend.Count -eq 0) { Write-Error "No se leyeron variables Backend de $local" }

Write-Host "Railway whoami..." -ForegroundColor Cyan
railway whoami
if ($LASTEXITCODE -ne 0) {
    Write-Error "Ejecuta: railway login"
}

Write-Host "Aplicando Backend ($($backend.Count) vars)..." -ForegroundColor Cyan
$backendArgs = @("variables", "set", "--service", "Backend")
foreach ($k in $backend.Keys) {
    $backendArgs += "$k=$($backend[$k])"
}
& railway @backendArgs
if ($LASTEXITCODE -ne 0) { Write-Error "Falló railway variables set (Backend). ¿Servicio llamado 'Backend'?" }

Write-Host "Aplicando Frontend ($($frontend.Count) vars)..." -ForegroundColor Cyan
$frontendArgs = @("variables", "set", "--service", "Frontend")
foreach ($k in $frontend.Keys) {
    $frontendArgs += "$k=$($frontend[$k])"
}
& railway @frontendArgs
if ($LASTEXITCODE -ne 0) { Write-Error "Falló railway variables set (Frontend). ¿Servicio llamado 'Frontend'?" }

Write-Host "Listo. Redeploy Backend y Frontend en Railway." -ForegroundColor Green
Write-Host "Luego: curl https://backend-production-38b8.up.railway.app/api/health"
