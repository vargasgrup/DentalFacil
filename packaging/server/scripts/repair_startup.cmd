# Reparacion definitiva — PC Servidor (ejecutar como Administrador).
@echo off
setlocal EnableExtensions
set INSTALL=%ProgramFiles%\NKDentalSoft\Server
if not exist "%INSTALL%\nkdentalsoft-server.exe" (
  echo No se encontro: %INSTALL%\nkdentalsoft-server.exe
  pause
  exit /b 1
)

echo [1/3] Registrando arranque de escritorio y eliminando servicio zombie...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL%\scripts\register_desktop_autostart.ps1" -InstallDir "%INSTALL%"
if errorlevel 1 (
  echo FALLO el registro. Revise el mensaje anterior.
  pause
  exit /b 1
)

echo [2/3] Verificando UI embebida...
if not exist "%INSTALL%\web\index.html" (
  echo FALTA web\index.html — reinstale el Setup completo.
  pause
  exit /b 1
)

echo [3/3] Abriendo aplicacion...
"%INSTALL%\nkdentalsoft-server.exe" --desktop
echo.
echo Si el navegador no cargo, abra manualmente: http://127.0.0.1:8001/
echo Log: %SystemDrive%\ProgramData\NKDentalSoft\logs\startup.log
pause
