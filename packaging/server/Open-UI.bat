@echo off
REM Clinic desktop launcher: start API if needed, then open native WebView2
REM window (branded N&K DentalSoft taskbar icon — not the Edge browser icon).
setlocal EnableExtensions
cd /d "%~dp0"
title N^&K DentalSoft

if not exist "%~dp0nkdentalsoft-server.exe" (
  echo ERROR: no se encuentra nkdentalsoft-server.exe
  pause
  exit /b 1
)

echo Iniciando N^&K DentalSoft. No cierre esta ventana...
echo El primer arranque o una actualizacion puede tardar unos minutos.
echo.

"%~dp0nkdentalsoft-server.exe" --desktop
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo No se pudo abrir N^&K DentalSoft.
  echo Log: %ProgramData%\NKDentalSoft\logs\startup.log
  echo Reparacion: "%~dp0scripts\repair_startup.cmd" ^(como Administrador^)
  echo.
  pause
)
exit /b %ERR%
