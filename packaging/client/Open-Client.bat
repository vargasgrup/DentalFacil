@echo off
setlocal EnableExtensions
REM Opens the clinic Server UI (Edge app mode). First run asks for LAN URL.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Connect-Clinic.ps1"
exit /b %ERRORLEVEL%
