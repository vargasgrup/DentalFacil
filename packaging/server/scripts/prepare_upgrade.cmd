# Quick helper: free nkdentalsoft-server.exe before running Setup (Admin).
@echo off
setlocal EnableExtensions
echo Deteniendo N&K DentalSoft Server para permitir la instalacion...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop_for_upgrade.ps1" -WaitSeconds 45 -AllowRename
if errorlevel 1 (
  echo.
  echo Si sigue bloqueado: abra el Administrador de tareas y finalice "nkdentalsoft-server.exe".
  pause
  exit /b 1
)
echo Listo. Ya puede ejecutar NKDentalSoft-Server-Setup-x64.exe
pause
exit /b 0
