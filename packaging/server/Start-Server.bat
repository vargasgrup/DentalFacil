@echo off
REM Foreground server console (diagnostics). Normal clinic use: Open-UI.bat / desktop shortcut.
setlocal EnableExtensions
cd /d "%~dp0"
title N^&K DentalSoft Server
color 0A

echo ============================================
echo   N^&K DentalSoft Server ^(consola^)
echo ============================================
echo Log: %SystemDrive%\ProgramData\NKDentalSoft\logs\startup.log
echo.

if not exist "%~dp0nkdentalsoft-server.exe" (
  echo ERROR: falta nkdentalsoft-server.exe
  pause
  exit /b 1
)

REM Prefer killing the broken Windows service zombie before binding :8001
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop_for_upgrade.ps1" -Port 8001 >nul 2>&1

set NKDENTALSOFT_DISABLE_TLS=1
echo Iniciando en HTTP http://127.0.0.1:8001/
echo Deje esta ventana abierta mientras usa el sistema.
echo.
"%~dp0nkdentalsoft-server.exe" --foreground
set ERR=%ERRORLEVEL%
echo.
echo Servidor terminado ^(codigo %ERR%^). Revise el log si fallo.
pause
exit /b %ERR%
