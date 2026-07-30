@echo off
REM Desinstalacion / limpieza TOTAL N&K DentalSoft (Server + Client).
REM Borra Program Files, ProgramData, LocalAppData, atajos, firewall y tareas.
REM Log: Escritorio\NKDentalSoft-limpia.log

setlocal
cd /d "%~dp0"

set "PS1=%~dp0scripts\clean_all_installs.ps1"
if not exist "%PS1%" (
  rem Dist layout: ps1 next to this BAT
  set "PS1=%~dp0clean_all_installs.ps1"
)
if not exist "%PS1%" (
  echo No se encontro clean_all_installs.ps1
  pause
  exit /b 1
)

echo.
echo  N^&K DentalSoft - DESINSTALACION / LIMPIEZA TOTAL
echo  ------------------------------------------------
echo  Se borraran Server, Client y datos en ProgramData.
echo  Log: Escritorio\NKDentalSoft-limpia.log
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando Administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%PS1%"" -NoElevate' -Wait"
  echo.
  echo Revise el log NKDentalSoft-limpia.log en el Escritorio.
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -NoElevate
set "RC=%ERRORLEVEL%"
echo.
echo Codigo=%RC%  Log en Escritorio: NKDentalSoft-limpia.log
pause
exit /b %RC%
