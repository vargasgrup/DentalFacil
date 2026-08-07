# Reparacion definitiva - PC Servidor (ejecutar como Administrador).
# Usa la carpeta real del Server (funciona en D:\Server, Program Files, etc.).
@echo off
setlocal EnableExtensions

REM scripts\ -> carpeta del Server
pushd "%~dp0.." >nul 2>&1
set "INSTALL=%CD%"
popd >nul 2>&1

if not exist "%INSTALL%\nkdentalsoft-server.exe" (
  echo No se encontro: %INSTALL%\nkdentalsoft-server.exe
  echo Este .cmd debe vivir en {Server}\scripts\repair_startup.cmd
  pause
  exit /b 1
)

echo Instalacion detectada: %INSTALL%
echo.

echo [1/3] Registrando arranque de escritorio y eliminando servicio zombie...
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%INSTALL%\scripts\register_desktop_autostart.ps1" -InstallDir "%INSTALL%"
if errorlevel 1 (
  echo FALLO el registro. Revise:
  echo   %SystemDrive%\ProgramData\NKDentalSoft\logs\install_autostart.log
  pause
  exit /b 1
)

echo [2/3] Verificando UI embebida...
if not exist "%INSTALL%\web\index.html" (
  echo FALTA web\index.html - reinstale el Setup completo.
  pause
  exit /b 1
)

echo [3/3] Abriendo aplicacion...
"%INSTALL%\nkdentalsoft-server.exe" --desktop
echo.
echo Si no abrio la ventana, use el navegador: http://127.0.0.1:8001/
echo Log: %SystemDrive%\ProgramData\NKDentalSoft\logs\startup.log
pause
