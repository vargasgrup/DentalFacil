@echo off
REM Limpia instalaciones anteriores de N&K DentalSoft (Server + Client).
REM Ejecutar como Administrador ANTES de reinstalar los Setup.
REM Por defecto CONSERVA la base de datos de la clinica en ProgramData.
REM Para borrar tambien datos: Limpiar-Instalaciones-NKDentalSoft.bat /wipe

setlocal
cd /d "%~dp0"

set "PS1=%~dp0scripts\clean_all_installs.ps1"
if not exist "%PS1%" (
  echo No se encontro: %PS1%
  pause
  exit /b 1
)

set "EXTRA="
if /I "%~1"=="/wipe" set "EXTRA=-WipeClinicData"
if /I "%~1"=="-WipeClinicData" set "EXTRA=-WipeClinicData"

echo.
echo  N^&K DentalSoft — limpieza de instalaciones anteriores
echo  ------------------------------------------------------
echo  Cierra Server y Client, borra Program Files, atajos,
echo  URL guardada del Client, firewall y tareas.
if defined EXTRA (
  echo  MODO WIPE: tambien borrara %%ProgramData%%\NKDentalSoft ^(datos^).
) else (
  echo  Conserva datos de clinica en %%ProgramData%%\NKDentalSoft
  echo  ^(pase /wipe si desea borrarlos tambien^).
)
echo.

net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando permisos de Administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%ComSpec%' -Verb RunAs -ArgumentList '/c \"\"%~f0\" %* & pause\"'"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %EXTRA%
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Listo. Ahora instale el Server Setup y luego el Client Setup.
) else (
  echo Hubo avisos. Si quedan carpetas, reinicie el PC y ejecute de nuevo.
)
exit /b %RC%
