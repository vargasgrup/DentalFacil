@echo off
REM Launcher with visible errors — used by Desktop / Start Menu shortcuts
cd /d "%~dp0"
echo Iniciando N^&K DentalSoft Server...
echo Log: %ProgramData%\NKDentalSoft\logs\startup.log
echo.
"%~dp0nkdentalsoft-server.exe" --foreground
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo ERROR: el servidor no arranco (codigo %ERR%).
  echo Abra el log: %ProgramData%\NKDentalSoft\logs\startup.log
  echo.
  pause
)
exit /b %ERR%
