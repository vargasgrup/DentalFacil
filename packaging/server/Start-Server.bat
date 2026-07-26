@echo off
REM Desktop / Start Menu launcher for N&K DentalSoft Server console.
REM Keeps the window open so errors are visible. Prefer the Windows service
REM for normal clinic use; this BAT is for diagnostics / foreground mode.
setlocal EnableExtensions
cd /d "%~dp0"
title N^&K DentalSoft Server
color 0A

echo ============================================
echo   N^&K DentalSoft Server
echo ============================================
echo Log: %ProgramData%\NKDentalSoft\logs\startup.log
echo.

if not exist "%~dp0nkdentalsoft-server.exe" (
  echo ERROR: no se encuentra nkdentalsoft-server.exe en:
  echo   %~dp0
  echo.
  pause
  exit /b 1
)

REM If the Windows service is already RUNNING, do not start a second instance
REM (that causes an instant crash / flash when port 8001 is taken).
sc query NKDentalSoftServer 2>nul | findstr /I "RUNNING" >nul
if %ERRORLEVEL%==0 (
  echo El servicio Windows ya esta en ejecucion.
  echo Abriendo la aplicacion en el navegador...
  echo.
  call "%~dp0Open-UI.bat"
  echo.
  pause
  exit /b 0
)

echo Iniciando servidor en primer plano...
echo Deje esta ventana abierta mientras usa el sistema.
echo.
"%~dp0nkdentalsoft-server.exe" --foreground
set ERR=%ERRORLEVEL%
echo.
echo --------------------------------------------
echo El proceso del servidor termino ^(codigo %ERR%^).
echo Si fue un error, revise:
echo   %ProgramData%\NKDentalSoft\logs\startup.log
echo --------------------------------------------
echo.
pause
endlocal
exit /b %ERR%
