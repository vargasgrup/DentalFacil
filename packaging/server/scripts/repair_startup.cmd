# Reparacion — PC Servidor con {"detail":"Not Found"} o acceso directo que cierra.
# Ejecutar como Administrador.

@echo off
setlocal EnableExtensions
set INSTALL=%ProgramFiles%\NKDentalSoft\Server
if not exist "%INSTALL%\nkdentalsoft-server.exe" (
  echo No se encontro: %INSTALL%\nkdentalsoft-server.exe
  pause
  exit /b 1
)

echo [1/4] Deteniendo servicio y liberando puerto 8001...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL%\scripts\stop_for_upgrade.ps1" -Port 8001
sc stop NKDentalSoftServer >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/4] Verificando UI embebida...
if not exist "%INSTALL%\web\index.html" (
  echo FALTA: %INSTALL%\web\index.html
  echo Reinstale NKDentalSoft-Server-Setup-x64.exe completo.
  pause
  exit /b 1
)

echo [3/4] Inicializando secretos/cert si faltan...
"%INSTALL%\nkdentalsoft-server.exe" --init-clinic
if errorlevel 1 (
  echo AVISO: init-clinic devolvio error. Revise %%ProgramData%%\NKDentalSoft\logs\startup.log
)

echo [4/4] Reiniciando servicio Windows...
"%INSTALL%\nkdentalsoft-server.exe" --startup auto install
"%INSTALL%\nkdentalsoft-server.exe" start
timeout /t 5 /nobreak >nul

echo.
echo Abra: https://127.0.0.1:8001/  o  http://127.0.0.1:8001/
echo Diagnostico: http://127.0.0.1:8001/api/system/ui-root
echo             http://127.0.0.1:8001/api/system/health
echo Log: %ProgramData%\NKDentalSoft\logs\startup.log
echo.
start "" "http://127.0.0.1:8001/api/system/ui-root"
pause
