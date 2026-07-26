@echo off
setlocal EnableExtensions
REM Always show connector UI to pick another Server / IP.
start "" "%~dp0ConnectClinic.exe" --force-prompt
exit /b 0
