# Reparacion rapida — PC donde el acceso directo cierra al instante
# Ejecutar en CMD como Administrador en la PC Servidor.

@echo off
set INSTALL=%ProgramFiles%\NKDentalSoft\Server
if not exist "%INSTALL%\nkdentalsoft-server.exe" (
  echo No se encontro: %INSTALL%\nkdentalsoft-server.exe
  pause
  exit /b 1
)

echo [1/3] Generando secretos y certificado...
"%INSTALL%\nkdentalsoft-server.exe" --init-clinic
if errorlevel 1 (
  echo FALLO init-clinic. Revise %ProgramData%\NKDentalSoft\logs\startup.log
  pause
  exit /b 1
)

echo [2/3] Arrancando en primer plano (deje esta ventana abierta)...
echo Luego abra en el navegador: https://127.0.0.1:8001/
echo Log: %ProgramData%\NKDentalSoft\logs\startup.log
echo.
"%INSTALL%\nkdentalsoft-server.exe" --foreground
pause
