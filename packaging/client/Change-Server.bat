@echo off
setlocal EnableExtensions
REM Clear saved server URL and prompt again.
del /q "%LOCALAPPDATA%\NKDentalSoft\client-url.txt" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Connect-Clinic.ps1" -ForcePrompt
exit /b %ERRORLEVEL%
