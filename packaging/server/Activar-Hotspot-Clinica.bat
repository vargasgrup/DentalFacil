@echo off
setlocal EnableExtensions
title N&K DentalSoft - Hotspot clinica
REM Do NOT nest RunAs here: enable_clinic_hotspot.ps1 already self-elevates.
REM Quoting via set "VAR=..." avoids breaks on spaces and ^& in paths.

set "ROOT=%~dp0"
set "PS1=%ROOT%scripts\enable_clinic_hotspot.ps1"
if not exist "%PS1%" set "PS1=%ROOT%enable_clinic_hotspot.ps1"

if not exist "%PS1%" (
  echo.
  echo ERROR: No se encontro enable_clinic_hotspot.ps1
  echo Buscado en:
  echo   %ROOT%scripts\enable_clinic_hotspot.ps1
  echo   %ROOT%enable_clinic_hotspot.ps1
  echo.
  echo Si ejecuta desde un USB/carpeta de instaladores, copie tambien
  echo la carpeta "scripts" con enable_clinic_hotspot.ps1
  echo ^(o reinstale el Server Setup^).
  echo.
  pause
  exit /b 1
)

echo Iniciando Hotspot clinica...
echo Script: %PS1%
echo.

REM -File "%PS1%" keeps spaces/^& safe; script asks UAC itself
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo Hubo avisos. Revise:
  echo   %ProgramData%\NKDentalSoft\logs\hotspot.log
  echo   %ProgramData%\NKDentalSoft\HOTSPOT.txt
)
pause
exit /b %RC%
