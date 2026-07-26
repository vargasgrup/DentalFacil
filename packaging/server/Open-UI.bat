@echo off
REM Clinic desktop launcher: ensure server is up, then open Edge/Chrome --app UI
REM (dedicated taskbar button with clinic favicon).
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "%~dp0nkdentalsoft-server.exe" (
  echo ERROR: no se encuentra nkdentalsoft-server.exe
  pause
  exit /b 1
)

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
