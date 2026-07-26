# Harden Windows LAN so Client PCs can reach N&K DentalSoft Server (:8001 + UDP 37020).
# - Sets Ethernet/Wi-Fi profiles to Private (Public blocks clinic LAN)
# - Ensures inbound firewall rules
# - Best-effort; safe to run repeatedly. Prefer Administrator.
param(
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

Write-Lan "[lan] repair start"

# 1) Prefer Private category on physical LAN/Wi-Fi (never force VPN tunnels)
try {
  $profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
  foreach ($p in @($profiles)) {
    $alias = [string]$p.InterfaceAlias
    $name = [string]$p.Name
    $cat = [string]$p.NetworkCategory
    $isVpn = ($alias -match 'TUN|TAP|VPN|ProTUN|WireGuard|OpenVPN|Nord|ZeroTier|Hamachi|vEthernet') -or
             ($name -match 'VPN|ProTUN|WireGuard|OpenVPN')
    if ($isVpn) {
      Write-Lan "[lan] skip VPN/profile $alias ($name) category=$cat"
      continue
    }
    if ($cat -ne "Private") {
      try {
        Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private -ErrorAction Stop
        Write-Lan "[lan] set Private: $alias ($name) was $cat"
      } catch {
        Write-Lan "[lan] could not set Private on $alias : $($_.Exception.Message)"
      }
    } else {
      Write-Lan "[lan] already Private: $alias"
    }
  }
} catch {
  Write-Lan "[lan] Get-NetConnectionProfile failed: $($_.Exception.Message)"
}

# 2) Firewall inbound rules (TCP API + UDP discovery)
$rules = @(
  @{ Name = "NKDentalSoft Server 8001"; Proto = "TCP"; Port = 8001 },
  @{ Name = "NKDentalSoft LAN Discovery 37020"; Proto = "UDP"; Port = 37020 }
)
foreach ($r in $rules) {
  try {
    netsh advfirewall firewall delete rule name="$($r.Name)" | Out-Null
  } catch {}
  $cmd = 'netsh advfirewall firewall add rule name="{0}" dir=in action=allow protocol={1} localport={2} profile=private,domain,public edge=yes' -f $r.Name, $r.Proto, $r.Port
  cmd /c $cmd | Out-Null
  Write-Lan "[lan] firewall $($r.Name) $($r.Proto)/$($r.Port)"
}

# 3) Enable network discovery bits (helps hostname / LAN visibility)
try {
  netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes | Out-Null
  netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes | Out-Null
  Write-Lan "[lan] enabled Network Discovery / File Sharing groups"
} catch {
  Write-Lan "[lan] discovery groups: $($_.Exception.Message)"
}

Write-Lan "[lan] repair done"
exit 0
