# Grant the clinic user write access to N&K DentalSoft data under ProgramData.
# Requires Administrator. Invoked by register_desktop_autostart.ps1 and repair_startup.cmd.
# ASCII-only for Windows PowerShell 5.1.
#
# Why this exists:
#   %ProgramData% inherits "Users = Read & execute" on FILES (they may create new
#   files, not modify existing ones). Everything the elevated installer creates
#   (clinica.db, config\.env, logs\startup.log) is owned by Administrators, so the
#   desktop app started by a normal double-click cannot write the database and the
#   server dies before opening TCP 8001 - the app then "only opens as Administrator".
#   Granting Modify with (OI)(CI) fixes existing files AND every future file.
#
# This only changes NTFS permissions. It never reads, moves or deletes clinic data.
param(
  [string]$DataRoot = ""
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

if (-not $DataRoot) {
  $pd = $env:ProgramData
  if (-not $pd) { $pd = Join-Path $env:SystemDrive "ProgramData" }
  $DataRoot = Join-Path $pd "NKDentalSoft"
}
$DataRoot = ([string]$DataRoot).Trim().Trim('"').TrimEnd('\')

$logDir = Join-Path $DataRoot "logs"
$logFile = Join-Path $logDir "grant_data_access.log"

function Write-Grant([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  Write-Host $line
  try {
    if (-not (Test-Path -LiteralPath $logDir)) {
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
  } catch {}
}

Write-Grant ("[acl] DataRoot=" + $DataRoot)

if (-not (Test-Path -LiteralPath $DataRoot)) {
  try {
    New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
    Write-Grant "[acl] created data root"
  } catch {
    Write-Grant ("[acl] ERROR cannot create data root: " + $_.Exception.Message)
    exit 1
  }
}

try {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { $isAdmin = $false }
Write-Grant ("[acl] Admin=" + $isAdmin)
if (-not $isAdmin) {
  Write-Grant "[acl] ERROR not elevated - run repair_startup.cmd as Administrator"
  exit 1
}

# BUILTIN\Users by SID: locale independent (Usuarios / Utilisateurs / Benutzer...).
$usersSid = "*S-1-5-32-545"

# Subfolders are listed explicitly so a partially created tree is still fixed.
$targets = @($DataRoot)
foreach ($sub in @(
  "config", "data", "logs", "certs", "uploads", "updates",
  "complementary_tests", "tooth_media", "historical_documents"
)) {
  $path = Join-Path $DataRoot $sub
  if (-not (Test-Path -LiteralPath $path)) {
    try { New-Item -ItemType Directory -Path $path -Force | Out-Null } catch {}
  }
  if (Test-Path -LiteralPath $path) { $targets += $path }
}

$failed = 0
foreach ($target in $targets) {
  # /T = existing children too (clinica.db was created read-only for Users).
  # /C = keep going when a single file is locked by the running server.
  $out = & icacls.exe $target /grant "${usersSid}:(OI)(CI)M" /T /C /Q 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    $failed++
    Write-Grant ("[acl] WARNING icacls exit=" + $code + " on " + $target)
    foreach ($line in @($out)) { Write-Grant ("[acl]   " + $line) }
  }
}

if ($failed -gt 0) {
  Write-Grant ("[acl] " + $failed + " target(s) reported warnings")
}

# Verify the effective ACL actually mentions the Users SID on the data folder.
$dataDir = Join-Path $DataRoot "data"
$verifyTarget = if (Test-Path -LiteralPath $dataDir) { $dataDir } else { $DataRoot }
$acl = (& icacls.exe $verifyTarget 2>&1) -join " "
$granted = $false
try {
  $usersName = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-545")).Translate([System.Security.Principal.NTAccount]).Value
  if ($acl -match [regex]::Escape($usersName)) { $granted = $true }
} catch {
  if ($acl -match "S-1-5-32-545") { $granted = $true }
}

if ($granted -and ($acl -match "\(M\)" -or $acl -match "\(F\)")) {
  Write-Grant "[acl] OK - clinic data is writable by standard users"
  exit 0
}

Write-Grant ("[acl] FAILED - effective ACL: " + $acl)
exit 1
