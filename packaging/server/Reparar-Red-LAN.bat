@echo off
setlocal EnableExtensions
REM Elevate and open Windows Firewall for clinic LAN clients
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0scripts\repair_lan.ps1\" -ServerExe \"%~dp0nkdentalsoft-server.exe\"'"
echo.
echo Si Windows pidio permisos, acepte. Luego pruebe el Client otra vez.
pause
