# Compiles ConnectClinic.exe (native WinForms LAN connector) with .NET Framework csc.
param(
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$ClientPkg = Resolve-Path (Join-Path $PSScriptRoot "..\client")
$Src = Join-Path $ClientPkg "ConnectClinic.cs"
if (-not $OutDir) { $OutDir = $ClientPkg }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutExe = Join-Path $OutDir "ConnectClinic.exe"

function Find-Csc {
    $roslyn = @(
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe",
        "${env:ProgramFiles(x86)}\Microsoft Visual Studio\18\BuildTools\MSBuild\Current\Bin\Roslyn\csc.exe",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\*\MSBuild\Current\Bin\Roslyn\csc.exe"
    )
    foreach ($p in $roslyn) {
        $hit = Get-Item $p -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    $fx = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    if (Test-Path $fx) { return $fx }
    throw "csc.exe not found"
}

$csc = Find-Csc
Write-Host "==> Compiling ConnectClinic.exe with $csc"

# Prefer Framework reference assemblies when using Roslyn
$refRoot = "${env:ProgramFiles(x86)}\Reference Assemblies\Microsoft\Framework\.NETFramework"
$fxVer = @("v4.8", "v4.7.2", "v4.7.1", "v4.6.2", "v4.5.2") | Where-Object {
    Test-Path (Join-Path $refRoot $_)
} | Select-Object -First 1

$argList = @(
    "/nologo",
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/utf8output",
    "/out:$OutExe"
)

if ($fxVer) {
    $base = Join-Path $refRoot $fxVer
    Write-Host "    Framework refs: $base"
    $argList += "/nostdlib+"
    $argList += "/reference:$(Join-Path $base 'mscorlib.dll')"
    $argList += "/reference:$(Join-Path $base 'System.dll')"
    $argList += "/reference:$(Join-Path $base 'System.Core.dll')"
    $argList += "/reference:$(Join-Path $base 'System.Drawing.dll')"
    $argList += "/reference:$(Join-Path $base 'System.Windows.Forms.dll')"
} else {
    $argList += @(
        "/reference:System.dll",
        "/reference:System.Core.dll",
        "/reference:System.Drawing.dll",
        "/reference:System.Windows.Forms.dll"
    )
}

$argList += $Src

& $csc @argList
if ($LASTEXITCODE -ne 0) { throw "csc failed ($LASTEXITCODE)" }
if (-not (Test-Path $OutExe)) { throw "Missing output: $OutExe" }

Get-Item $OutExe | Format-List Name, Length, LastWriteTime
Write-Host "OK $OutExe"
