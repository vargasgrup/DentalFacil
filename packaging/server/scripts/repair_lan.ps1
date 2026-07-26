# Aggressive LAN access for N&K DentalSoft Server.
# Port rules alone are often not enough on Windows — allow the EXE itself,
# ICMP (ping), Network Discovery, and Private profile.
param(
  [string]$ServerExe = "",
  [switch]$Quiet
)

$ErrorActionPreference = "Continue"
$logDir = Join-Path $env:ProgramData "NKDentalSoft\logs"
$log = Join-Path $logDir "lan_repair.log"

function Write-Lan([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  if (-not $Quiet) { Write-Host $line }
  try {
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
    Add-Content -Path $log -Value $line -Encoding UTF8
  } catch {}
}

function Find-ServerExe([string]$Hint) {
  if ($Hint -and (Test-Path -LiteralPath $Hint)) { return (Resolve-Path $Hint).Path }
  $candidates = @(
    (Join-Path ${env:ProgramFiles} "NKDentalSoft\Server\nkdentalsoft-server.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "NKDentalSoft\Server\nkdentalsoft-server.exe")
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return ""
}

Write-Lan "[lan] repair start (aggressive)"

# 1) Private profile on real LAN/Wi-Fi
try {
  foreach ($p in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)) {
    $alias = [string]$p.InterfaceAlias
    $name = [string]$p.Name
    $cat = [string]$p.NetworkCategory
    $isVpn = ($alias -match 'TUN|TAP|VPN|ProTUN|WireGuard|OpenVPN|Nord|ZeroTier|Hamachi|vEthernet') -or
             ($name -match 'VPN|ProTUN|WireGuard|OpenVPN')
    if ($isVpn) {
      Write-Lan "[lan] skip VPN $alias ($cat)"
      continue
    }
    if ($cat -ne "Private") {
      try {
        Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
        Write-Lan "[lan] set Private: $alias (was $cat)"
      } catch {
        Write-Lan "[lan] Private failed on $alias : $($_.Exception.Message)"
      }
    } else {
      Write-Lan "[lan] already Private: $alias"
    }
  }
} catch {
  Write-Lan "[lan] profiles: $($_.Exception.Message)"
}

# 2) Remove stale / conflicting rules, recreate
$names = @(
  "NKDentalSoft Server 8001",
  "NKDentalSoft LAN Discovery 37020",
  "NKDentalSoft Server EXE",
  "NKDentalSoft Server EXE Out",
  "nkdentalsoft-server"
)
foreach ($n in $names) {
  try { netsh advfirewall firewall delete rule name="$n" | Out-Null } catch {}
  try { Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue } catch {}
}

# Port allow — all profiles, edge traversal
cmd /c 'netsh advfirewall firewall add rule name="NKDentalSoft Server 8001" dir=in action=allow protocol=TCP localport=8001 profile=any edge=yes enable=yes' | Out-Null
cmd /c 'netsh advfirewall firewall add rule name="NKDentalSoft LAN Discovery 37020" dir=in action=allow protocol=UDP localport=37020 profile=any edge=yes enable=yes' | Out-Null
Write-Lan "[lan] port rules TCP/8001 + UDP/37020 (profile=any)"

# 3) Program allow (critical — Windows often ignores port-only rules for apps)
$exe = Find-ServerExe $ServerExe
if ($exe) {
  $cmdIn = 'netsh advfirewall firewall add rule name="NKDentalSoft Server EXE" dir=in action=allow program="{0}" profile=any enable=yes edge=yes' -f $exe
  $cmdOut = 'netsh advfirewall firewall add rule name="NKDentalSoft Server EXE Out" dir=out action=allow program="{0}" profile=any enable=yes' -f $exe
  cmd /c $cmdIn | Out-Null
  cmd /c $cmdOut | Out-Null
  Write-Lan "[lan] program allow: $exe"
} else {
  Write-Lan "[lan] WARNING: server EXE not found — port rules only"
}

# 4) ICMP + discovery (helps Client diagnose "host alive")
try {
  netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
  netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null
  # Explicit ICMPv4 echo
  netsh advfirewall firewall delete rule name="NKDentalSoft ICMP Allow" | Out-Null
  netsh advfirewall firewall add rule name="NKDentalSoft ICMP Allow" protocol=icmpv4:8,any dir=in action=allow profile=any enable=yes | Out-Null
  Write-Lan "[lan] ICMP + discovery groups enabled"
} catch {
  Write-Lan "[lan] ICMP/discovery: $($_.Exception.Message)"
}

# 5) Soften Public profile inbound for allow rules to take effect
try {
  Set-NetFirewallProfile -Profile Public -NotifyOnListen False -ErrorAction SilentlyContinue
  # Do NOT disable firewall — only ensure our allow rules exist
  Write-Lan "[lan] Public profile notify adjusted"
} catch {}

Write-Lan "[lan] repair done"
exit 0
