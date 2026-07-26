@echo off
setlocal EnableExtensions
title N&K DentalSoft - Cambiar servidor
REM Always show connector UI so the user can pick another Server / IP.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Connect-Clinic.ps1" -ForcePrompt
exit /b %ERRORLEVEL%
