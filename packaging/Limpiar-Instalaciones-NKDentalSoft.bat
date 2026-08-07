@echo off
REM Fallback limpia total sin depender del EXE NSIS.
REM Ejecutar: click derecho > Ejecutar como administrador

setlocal
cd /d "%~dp0"

set "PS1=%~dp0scripts\clean_all_installs.ps1"
if not exist "%PS1%" set "PS1=%~dp0clean_all_installs.ps1"
if not exist "%PS1%" (
  echo No se encontro clean_all_installs.ps1
  pause
  exit /b 1
)

echo.
echo  N^&K DentalSoft - DESINSTALACION TOTAL
echo  Se borrara programa + datos. Ver log en el Escritorio.
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo Elevando a Administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%PS1%"" -NoElevate' -Wait"
  pause
  exit /b 0
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -NoElevate
set "RC=%ERRORLEVEL%"
echo.
echo Codigo=%RC%
echo Log: Escritorio y %%TEMP%%\NKDentalSoft-limpia.log
pause
exit /b %RC%
