# N&K DentalSoft Client — native LAN connector (ASCII-only).
# Auto-discovers servers on TCP 8001 (/api/system/health), lets the user
# pick or type a URL, then opens Edge in app mode.
#
# Never auto-opens a hardcoded IP. Always shows this window first unless
# -AutoConnect is used with a working saved URL.

param(
  [switch]$ForcePrompt,
  [switch]$AutoConnect
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$cfgDir = Join-Path $env:LOCALAPPDATA "NKDentalSoft"
$cfgFile = Join-Path $cfgDir "client-url.txt"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null

function Find-Edge {
  foreach ($c in @(
      (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
      (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
    )) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return $null
}

function Open-ClinicUrl([string]$Url) {
  $url = $Url.Trim().TrimEnd("/")
  if ($url -and ($url -notmatch "^https?://")) { $url = "http://" + $url }
  Set-Content -LiteralPath $cfgFile -Value $url -Encoding ASCII
  $edge = Find-Edge
  if ($edge) {
    Start-Process -FilePath $edge -ArgumentList @("--app=$url", "--new-window")
  } else {
    Start-Process $url
  }
}

function Test-NkServer([string]$Ip, [int]$Port = 8001, [int]$TimeoutMs = 350) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($Ip, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      try { $client.Close() } catch {}
      return $null
    }
    $client.EndConnect($iar)
    $client.Close()
  } catch {
    return $null
  }
  try {
    $uri = "http://${Ip}:${Port}/api/system/health"
    $resp = Invoke-WebRequest -Uri $uri -Method GET -TimeoutSec 2 -UseBasicParsing
    if ($resp.StatusCode -ne 200) { return $null }
    $json = $resp.Content | ConvertFrom-Json
    $product = [string]($json.product)
    if (-not $product) { $product = [string]($json.app) }
    if (-not $product) { $product = "N&K DentalSoft" }
    # Accept known product names
    if ($product -notmatch "Dental|N&K|NK") {
      # Still allow if health shape looks right
      if (-not $json.status) { return $null }
    }
    return [pscustomobject]@{
      Ip      = $Ip
      Port    = $Port
      Url     = "http://${Ip}:${Port}/"
      Product = $product
      Version = [string]($json.version)
      Status  = [string]($json.status)
    }
  } catch {
    return $null
  }
}

function Get-LanPrefixes {
  $prefixes = New-Object System.Collections.Generic.List[string]
  try {
    $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixLength -ge 8 -and
        $_.PrefixLength -le 24
      }
    foreach ($a in @($addrs)) {
      $parts = $a.IPAddress.Split(".")
      if ($parts.Count -ne 4) { continue }
      $prefix = "{0}.{1}.{2}" -f $parts[0], $parts[1], $parts[2]
      if (-not $prefixes.Contains($prefix)) { $prefixes.Add($prefix) }
    }
  } catch {}
  if ($prefixes.Count -eq 0) {
    # Fallback common clinic ranges
    @("192.168.0", "192.168.1", "192.168.100") | ForEach-Object { $prefixes.Add($_) }
  }
  return $prefixes
}

function Find-MdnsCandidates {
  # Hostnames published by backend mdns_announce.py
  $names = @(
    "nkdentalsoft-server.local",
    "nkdentalsoft.local",
    "nk-dentalsoft.local"
  )
  $ips = New-Object System.Collections.Generic.List[string]
  foreach ($name in $names) {
    try {
      $records = Resolve-DnsName -Name $name -Type A -DnsOnly -ErrorAction SilentlyContinue
      foreach ($r in @($records)) {
        if ($r.IPAddress -and $r.IPAddress -notlike "*:*") {
          if (-not $ips.Contains($r.IPAddress)) { $ips.Add($r.IPAddress) }
        }
      }
    } catch {}
    try {
      $entry = [System.Net.Dns]::GetHostAddresses($name)
      foreach ($a in @($entry)) {
        if ($a.AddressFamily -eq "InterNetwork") {
          $s = $a.ToString()
          if (-not $ips.Contains($s)) { $ips.Add($s) }
        }
      }
    } catch {}
  }
  return $ips
}

function Find-NkServers([System.Windows.Forms.Label]$StatusLabel) {
  $found = New-Object System.Collections.Generic.List[object]
  $seen = @{}

  # 1) Quick local check
  if ($StatusLabel) {
    $StatusLabel.Text = "Comprobando este equipo (localhost:8001)..."
    [System.Windows.Forms.Application]::DoEvents()
  }
  foreach ($local in @("127.0.0.1")) {
    $hit = Test-NkServer -Ip $local -TimeoutMs 600
    if ($hit -and -not $seen.ContainsKey($hit.Url)) {
      $seen[$hit.Url] = $true
      $found.Add($hit)
    }
  }

  # 2) mDNS / .local hostname (announced by Server)
  if ($StatusLabel) {
    $StatusLabel.Text = "Buscando por nombre de red (mDNS)..."
    [System.Windows.Forms.Application]::DoEvents()
  }
  foreach ($ip in @(Find-MdnsCandidates)) {
    $hit = Test-NkServer -Ip $ip -TimeoutMs 800
    if ($hit -and -not $seen.ContainsKey($hit.Url)) {
      $seen[$hit.Url] = $true
      $found.Add($hit)
    }
  }

  # Early exit if mDNS / local already found something
  if ($found.Count -gt 0) {
    return $found
  }

  # 3) Parallel LAN sweep of /24 prefixes (port 8001)
  $prefixes = Get-LanPrefixes
  foreach ($prefix in $prefixes) {
    if ($StatusLabel) {
      $StatusLabel.Text = "Explorando red $prefix.* (puerto 8001)..."
      [System.Windows.Forms.Application]::DoEvents()
    }
    $pool = [runspacefactory]::CreateRunspacePool(1, 48)
    $pool.Open()
    $runners = @()
    for ($i = 1; $i -le 254; $i++) {
      $ip = "$prefix.$i"
      $ps = [powershell]::Create().AddScript({
          param($Ip, $Port, $TimeoutMs)
          try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $iar = $tcp.BeginConnect($Ip, $Port, $null, $null)
            if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
              $tcp.Close(); return $null
            }
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $Ip
          } catch { return $null }
        }).AddArgument($ip).AddArgument(8001).AddArgument(200)
      $ps.RunspacePool = $pool
      $runners += [pscustomobject]@{ Pipe = $ps; Handle = $ps.BeginInvoke() }
    }
    $openIps = @()
    foreach ($r in $runners) {
      $ip = $r.Pipe.EndInvoke($r.Handle)
      $r.Pipe.Dispose()
      if ($ip) { $openIps += $ip }
    }
    $pool.Close()
    $pool.Dispose()

    foreach ($ip in $openIps) {
      if ($StatusLabel) {
        $StatusLabel.Text = "Verificando $ip ..."
        [System.Windows.Forms.Application]::DoEvents()
      }
      $hit = Test-NkServer -Ip $ip
      if ($hit -and -not $seen.ContainsKey($hit.Url)) {
        $seen[$hit.Url] = $true
        $found.Add($hit)
      }
    }
    if ($found.Count -gt 0) { break }
  }

  return $found
}

# ---- Optional fast path: saved URL still healthy ----
$saved = ""
if (-not $ForcePrompt -and (Test-Path -LiteralPath $cfgFile)) {
  $saved = (Get-Content -LiteralPath $cfgFile -Raw -ErrorAction SilentlyContinue).Trim()
}
if ($AutoConnect -and $saved -and -not $ForcePrompt) {
  try {
    $u = [uri]$saved
    $probe = Test-NkServer -Ip $u.Host -Port $(if ($u.Port -gt 0) { $u.Port } else { 8001 }) -TimeoutMs 1200
    if ($probe) {
      Open-ClinicUrl $probe.Url
      exit 0
    }
    # Stale / unreachable saved URL (e.g. old hardcoded 192.168.1.10) -> clear and show UI
    Remove-Item -LiteralPath $cfgFile -Force -ErrorAction SilentlyContinue
    $saved = ""
  } catch {
    Remove-Item -LiteralPath $cfgFile -Force -ErrorAction SilentlyContinue
    $saved = ""
  }
}

# ---- WinForms UI ----
$form = New-Object System.Windows.Forms.Form
$form.Text = "N&K DentalSoft Client"
$form.Size = New-Object System.Drawing.Size(560, 480)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Conectar al servidor de la clinica"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 13)
$title.Location = New-Object System.Drawing.Point(20, 16)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Busca automaticamente el PC servidor en la red local (puerto 8001)."
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$subtitle.Location = New-Object System.Drawing.Point(22, 46)
$subtitle.Size = New-Object System.Drawing.Size(500, 20)
$form.Controls.Add($subtitle)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Listo."
$status.Location = New-Object System.Drawing.Point(22, 74)
$status.Size = New-Object System.Drawing.Size(500, 20)
$status.ForeColor = [System.Drawing.Color]::FromArgb(30, 136, 229)
$form.Controls.Add($status)

$list = New-Object System.Windows.Forms.ListBox
$list.Location = New-Object System.Drawing.Point(24, 100)
$list.Size = New-Object System.Drawing.Size(500, 180)
$list.IntegralHeight = $false
$form.Controls.Add($list)

$manualLbl = New-Object System.Windows.Forms.Label
$manualLbl.Text = "O escriba la URL / IP manualmente:"
$manualLbl.Location = New-Object System.Drawing.Point(22, 292)
$manualLbl.AutoSize = $true
$form.Controls.Add($manualLbl)

$manual = New-Object System.Windows.Forms.TextBox
$manual.Location = New-Object System.Drawing.Point(24, 314)
$manual.Size = New-Object System.Drawing.Size(500, 26)
$manual.Text = $(if ($saved) { $saved } else { "" })
$form.Controls.Add($manual)

$servers = New-Object System.Collections.ArrayList

function Refresh-ServerList {
  $list.Items.Clear()
  [void]$servers.Clear()
  $status.Text = "Buscando servidores N&K DentalSoft..."
  $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
  [System.Windows.Forms.Application]::DoEvents()
  try {
    $hits = Find-NkServers -StatusLabel $status
    foreach ($h in $hits) {
      [void]$servers.Add($h)
      $label = "{0}  —  {1} v{2}  [{3}]" -f $h.Url, $h.Product, $h.Version, $h.Status
      [void]$list.Items.Add($label)
    }
    if ($hits.Count -eq 0) {
      $status.Text = "No se encontro ningun servidor. Verifique Wi-Fi/LAN y que el Server este encendido."
    } else {
      $status.Text = ("Se encontraron {0} servidor(es). Seleccione uno y pulse Conectar." -f $hits.Count)
      $list.SelectedIndex = 0
      $manual.Text = $hits[0].Url
    }
  } catch {
    $status.Text = "Error al buscar: $($_.Exception.Message)"
  } finally {
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
  }
}

$list.add_SelectedIndexChanged({
  if ($list.SelectedIndex -ge 0 -and $list.SelectedIndex -lt $servers.Count) {
    $manual.Text = $servers[$list.SelectedIndex].Url
  }
})

$btnSearch = New-Object System.Windows.Forms.Button
$btnSearch.Text = "Buscar en la red"
$btnSearch.Location = New-Object System.Drawing.Point(24, 360)
$btnSearch.Size = New-Object System.Drawing.Size(140, 34)
$btnSearch.Add_Click({ Refresh-ServerList })
$form.Controls.Add($btnSearch)

$btnConnect = New-Object System.Windows.Forms.Button
$btnConnect.Text = "Conectar"
$btnConnect.Location = New-Object System.Drawing.Point(280, 360)
$btnConnect.Size = New-Object System.Drawing.Size(120, 34)
$btnConnect.BackColor = [System.Drawing.Color]::FromArgb(30, 136, 229)
$btnConnect.ForeColor = [System.Drawing.Color]::White
$btnConnect.FlatStyle = "Flat"
$btnConnect.Add_Click({
  $url = $manual.Text.Trim()
  if (-not $url) {
    [System.Windows.Forms.MessageBox]::Show(
      "Seleccione un servidor de la lista o escriba la URL/IP.",
      "N&K DentalSoft",
      "OK",
      "Warning"
    ) | Out-Null
    return
  }
  if ($url -notmatch "^https?://") { $url = "http://" + $url }
  # Normalize bare IP
  if ($url -match "^https?://(\d+\.\d+\.\d+\.\d+)/?$") {
    $url = "http://$($Matches[1]):8001/"
  }
  $status.Text = "Comprobando $url ..."
  [System.Windows.Forms.Application]::DoEvents()
  try {
    $u = [uri]$url
    $hostName = $u.Host
    $port = if ($u.Port -gt 0) { $u.Port } else { 8001 }
    $probe = Test-NkServer -Ip $hostName -Port $port -TimeoutMs 1500
    if (-not $probe) {
      [System.Windows.Forms.MessageBox]::Show(
        "No hay respuesta de N&K DentalSoft en:`n$url`n`nRevise que el Server este encendido y el firewall permita el puerto 8001.",
        "No se pudo conectar",
        "OK",
        "Error"
      ) | Out-Null
      return
    }
    Open-ClinicUrl $probe.Url
    $form.Close()
  } catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Error", "OK", "Error") | Out-Null
  }
})
$form.Controls.Add($btnConnect)

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "Cancelar"
$btnCancel.Location = New-Object System.Drawing.Point(410, 360)
$btnCancel.Size = New-Object System.Drawing.Size(114, 34)
$btnCancel.Add_Click({ $form.Close() })
$form.Controls.Add($btnCancel)

$form.AcceptButton = $btnConnect
$form.CancelButton = $btnCancel

$form.Add_Shown({
  Refresh-ServerList
})

[void]$form.ShowDialog()
exit 0
