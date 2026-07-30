@echo off
setlocal EnableExtensions
title N&K DentalSoft - Hotspot clinica
REM Elevate + keep window open. Actual enable is in enable_clinic_hotspot.ps1

net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando Administrador para Hotspot clinica...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0scripts\enable_clinic_hotspot.ps1\" -NoElevate'"
  echo.
  echo Si Windows pidio permisos, acepte y espere la ventana elevada.
  echo Al terminar vera SSID, clave y URL http://192.168.137.1:8001/
  pause
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\enable_clinic_hotspot.ps1" -NoElevate
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo Hubo avisos. Revise %%ProgramData%%\NKDentalSoft\logs\hotspot.log
  pause
)
exit /b %RC%
