@echo off
setlocal EnableExtensions
REM Native WinForms connector (no PowerShell UI). Auto-connect if saved URL is healthy.
start "" "%~dp0ConnectClinic.exe" --auto-connect
exit /b 0
