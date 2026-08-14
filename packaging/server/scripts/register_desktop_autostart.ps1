# Register clinic desktop autostart (Scheduled Task) and remove zombie Win32 service.
# Requires Administrator. Invoked by the NSIS installer and repair_startup.cmd.
# ASCII-only for Windows PowerShell 5.1.
param(
  [string]$InstallDir = $(Join-Path ${env:ProgramFiles} "NKDentalSoft\Server")
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$InstallDir = [string]$InstallDir
$InstallDir = $InstallDir.Trim().Trim('"').TrimEnd('\')

$exe = Join-Path $InstallDir "nkdentalsoft-server.exe"
$stopScript = Join-Path $InstallDir "scripts\stop_for_upgrade.ps1"
$logDir = Join-Path $env:ProgramData "NKDentalSoft\logs"
if (-not $env:ProgramData) {
  $logDir = Join-Path $env:SystemDrive "ProgramData\NKDentalSoft\logs"
}
$bootLog = Join-Path $logDir "install_autostart.log"

function Write-Boot([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  Write-Host $line
  try {
    if (-not (Test-Path -LiteralPath $logDir)) {
      New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -LiteralPath $bootLog -Value $line -Encoding UTF8
  } catch {}
}

try {
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  Set-Content -LiteralPath $bootLog -Value ("NKDentalSoft install_autostart " + (Get-Date -Format "o")) -Encoding UTF8
} catch {}

Write-Boot ("[desktop] InstallDir=" + $InstallDir)
try {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { $isAdmin = $false }
Write-Boot ("[desktop] Admin=" + $isAdmin + " User=" + $env:USERNAME)

if (-not (Test-Path -LiteralPath $exe)) {
  Write-Boot ("[desktop] ERROR missing exe: " + $exe)
  throw ("Server exe not found: " + $exe)
}

function Quote-Arg([string]$Value) {
  # Start-Process joins -ArgumentList verbatim with spaces and never quotes it, so an
  # install path with a space (C:\Program Files\...) or a task name with a space used
  # to arrive as two broken tokens. Quote every argument ourselves.
  if ($null -eq $Value -or $Value -eq "") { return '""' }
  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }
  return $Value
}

function Run-Hidden {
  param([string]$FilePath, [string[]]$ArgumentList, [int]$Seconds = 60)
  try {
    $line = (@($ArgumentList) | ForEach-Object { Quote-Arg $_ }) -join " "
    $p = Start-Process -FilePath $FilePath -ArgumentList $line -WindowStyle Hidden -PassThru -ErrorAction Stop
    if (-not $p.WaitForExit($Seconds * 1000)) {
      try { $p.Kill() } catch {}
      return 124
    }
    return $p.ExitCode
  } catch {
    Write-Boot ("[desktop] Run-Hidden fail " + $FilePath + " :: " + $_.Exception.Message)
    return 1
  }
}

$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $psExe)) { $psExe = "powershell.exe" }

if (Test-Path -LiteralPath $stopScript) {
  Write-Boot "[desktop] Stopping previous instance (child process, SkipWritableCheck)..."
  $code = Run-Hidden -FilePath $psExe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $stopScript,
    "-InstallDir", $InstallDir, "-Port", "8001", "-SkipWritableCheck"
  ) -Seconds 90
  Write-Boot ("[desktop] stop_for_upgrade exit=" + $code)
} else {
  Write-Boot "[desktop] stop_for_upgrade.ps1 missing - kill by name only"
  Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Run-Hidden -FilePath "cmd.exe" -ArgumentList @("/c", "taskkill /F /IM nkdentalsoft-server.exe /T") -Seconds 15 | Out-Null
}

try { & $exe stop 2>$null } catch {}
try { & $exe remove 2>$null } catch {}
Run-Hidden -FilePath "sc.exe" -ArgumentList @("stop", "NKDentalSoftServer") -Seconds 10 | Out-Null
Run-Hidden -FilePath "sc.exe" -ArgumentList @("delete", "NKDentalSoftServer") -Seconds 10 | Out-Null

@(
  (Join-Path $InstallDir "server_entry.py"),
  (Join-Path $InstallDir "_internal\server_entry.py"),
  (Join-Path $InstallDir "windows_service.py"),
  (Join-Path $InstallDir "_internal\windows_service.py"),
  (Join-Path $InstallDir "desktop_runtime.py"),
  (Join-Path $InstallDir "_internal\desktop_runtime.py")
) | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
    Write-Boot ("[desktop] Removed shadow module " + $_)
  }
}

Start-Sleep -Seconds 2

# Clinic data must be writable by the logged-on user, or a plain double-click can
# never start the server (only "Run as Administrator" would work).
$grantScript = Join-Path $InstallDir "scripts\grant_clinic_data_access.ps1"
if (Test-Path -LiteralPath $grantScript) {
  Write-Boot "[desktop] Granting clinic data write access to standard users..."
  $code = Run-Hidden -FilePath $psExe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $grantScript
  ) -Seconds 120
  Write-Boot ("[desktop] grant_clinic_data_access exit=" + $code)
  if ($code -ne 0) {
    Write-Boot "[desktop] WARNING: clinic data may stay read-only for standard users"
  }
} else {
  Write-Boot ("[desktop] WARNING: missing " + $grantScript)
}

$taskName = "NKDentalSoft Server"
Write-Boot ("[desktop] Registering Scheduled Task '" + $taskName + "' (ONLOGON)...")

function Test-TaskExists([string]$Name) {
  try {
    if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
      if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) { return $true }
    }
  } catch {}
  # Call operator quotes $Name correctly even with spaces.
  & schtasks.exe /Query /TN $Name 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Register-DesktopTask([string]$Name, [string]$Exe, [string]$WorkDir) {
  # ScheduledTasks cmdlets build the action arguments without any quoting guesswork.
  try {
    if (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) {
      $action = New-ScheduledTaskAction -Execute $Exe -Argument "--foreground" -WorkingDirectory $WorkDir
      $trigger = New-ScheduledTaskTrigger -AtLogOn
      # Group = BUILTIN\Users by SID so the task runs for whoever logs on, in any locale.
      $principal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Highest
      # ExecutionTimeLimit 0 = never kill the server (schtasks defaults to 72h).
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
      Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
      if (Test-TaskExists $Name) { return "cmdlet" }
    }
  } catch {
    Write-Boot ("[desktop] Register-ScheduledTask failed: " + $_.Exception.Message)
  }

  # Fallback: schtasks /XML avoids command-line quoting entirely.
  try {
    $xmlPath = Join-Path $env:TEMP ("nkds_task_" + [Guid]::NewGuid().ToString("N") + ".xml")
    $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>NK DentalSoft clinic server (desktop autostart)</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <GroupId>S-1-5-32-545</GroupId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$Exe</Command>
      <Arguments>--foreground</Arguments>
      <WorkingDirectory>$WorkDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
    Set-Content -LiteralPath $xmlPath -Value $xml -Encoding Unicode
    & schtasks.exe /Create /TN $Name /XML $xmlPath /F 2>&1 | ForEach-Object { Write-Boot ("[desktop]   " + $_) }
    Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
    if (Test-TaskExists $Name) { return "xml" }
  } catch {
    Write-Boot ("[desktop] schtasks /XML failed: " + $_.Exception.Message)
  }
  return ""
}

# Call operator (not Run-Hidden) so the quoted task name reaches schtasks intact.
& schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null

$taskOk = $false
$how = Register-DesktopTask -Name $taskName -Exe $exe -WorkDir $InstallDir
if ($how) {
  $taskOk = $true
  Write-Boot ("[desktop] Scheduled Task registered via " + $how)
} else {
  Write-Boot "[desktop] WARNING: could not register Scheduled Task 'NKDentalSoft Server'"
}

$repairLan = Join-Path $InstallDir "scripts\repair_lan.ps1"
if (Test-Path -LiteralPath $repairLan) {
  Write-Boot "[desktop] repair_lan.ps1 (with ServerExe)..."
  $code = Run-Hidden -FilePath $psExe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $repairLan,
    "-ServerExe", $exe, "-Quiet"
  ) -Seconds 90
  Write-Boot ("[desktop] repair_lan exit=" + $code)
}

function Test-PortOpen([int]$Port = 8001) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800, $false)
    if (-not $ok) { try { $tcp.Close() } catch {}; return $false }
    try { $tcp.EndConnect($iar) } catch { try { $tcp.Close() } catch {}; return $false }
    try { $tcp.Close() } catch {}
    return $true
  } catch {
    return $false
  }
}

function Start-ServerHidden {
  $env:NKDENTALSOFT_DISABLE_TLS = "1"
  Write-Boot "[desktop] Start-Process --foreground"
  Start-Process -FilePath $exe -ArgumentList "--foreground" -WorkingDirectory $InstallDir -WindowStyle Hidden
}

function Test-LogFresh([string]$Path, [int]$Seconds = 45) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    $age = (Get-Date) - (Get-Item -LiteralPath $Path).LastWriteTime
    return ($age.TotalSeconds -le $Seconds)
  } catch {
    return $false
  }
}

# First post-install / upgrade: existing clinica.db migrations + Defender first-scan
# can exceed 90s. NEVER taskkill a process that is still writing startup.log.
$startupLog = Join-Path $logDir "startup.log"
$ok = $false
for ($attempt = 1; $attempt -le 2; $attempt++) {
  if (Test-PortOpen) {
    Write-Boot ("[desktop] Port 8001 already listening (attempt " + $attempt + ")")
    $ok = $true
    break
  }
  $alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
  if (-not $alive) {
    Start-ServerHidden
  } else {
    Write-Boot ("[desktop] Server already running PID=" + (($alive | ForEach-Object { $_.Id }) -join ","))
  }
  for ($i = 1; $i -le 180; $i++) {
    if (Test-PortOpen) {
      Write-Boot ("[desktop] Port 8001 open after " + $i + "s (attempt " + $attempt + ")")
      $ok = $true
      break
    }
    $alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
    if (-not $alive -and $i -ge 8) {
      Write-Boot ("[desktop] process exited at " + $i + "s - will retry")
      break
    }
    if (($i % 15) -eq 0) {
      $fresh = Test-LogFresh -Path $startupLog -Seconds 45
      Write-Boot ("[desktop] still waiting " + $i + "s alive=" + [bool]$alive + " logFresh=" + $fresh)
    }
    Start-Sleep -Seconds 1
  }
  if ($ok) { break }
  $alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
  $fresh = Test-LogFresh -Path $startupLog -Seconds 45
  if ($alive -and $fresh) {
    Write-Boot "[desktop] PARTIAL OK - process still bootstrapping (do not kill mid-migration)"
    exit 0
  }
  if ($alive -and -not $fresh) {
    Write-Boot "[desktop] stale process (no log progress) - restarting once"
    Run-Hidden -FilePath "cmd.exe" -ArgumentList @("/c", "taskkill /F /IM nkdentalsoft-server.exe /T") -Seconds 15 | Out-Null
    Start-Sleep -Seconds 3
    continue
  }
  Write-Boot ("[desktop] Attempt " + $attempt + " timed out - retrying")
  Start-Sleep -Seconds 2
}

if ($ok) {
  Write-Boot "[desktop] OK - http://127.0.0.1:8001/ is listening"
}

# The autostart task is what lets the desktop icon work after a reboot WITHOUT
# elevation. A listening port right now is not proof: the installer's own elevated
# child is listening. Never report success while the task is missing.
if (-not $taskOk -and (Test-TaskExists $taskName)) {
  $taskOk = $true
  Write-Boot "[desktop] Scheduled Task verified on re-check"
}

if (-not $taskOk) {
  Write-Boot ("[desktop] FAILED - autostart task missing, see " + $bootLog)
  exit 3
}

if ($ok) { exit 0 }

$alive = Get-Process -Name "nkdentalsoft-server" -ErrorAction SilentlyContinue
if ($alive) {
  Write-Boot "[desktop] PARTIAL OK - task registered, process running, port not open yet"
  exit 0
}
Write-Boot "[desktop] PARTIAL OK - task registered; use Open-UI.bat or next logon"
exit 0
