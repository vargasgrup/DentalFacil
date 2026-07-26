# Resolve a LAN IPv4 for the self-signed cert SAN. Writes one line to stdout / optional -OutFile.
param(
  [string]$OutFile = "$env:TEMP\nkds_host.txt"
)
$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) { $ip = '127.0.0.1' }
Set-Content -Path $OutFile -Value $ip -NoNewline -Encoding ascii
Write-Output $ip
