@echo off
setlocal EnableExtensions
title N&K DentalSoft Client
REM Shows native connector if no healthy saved URL; never opens a hardcoded IP.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Connect-Clinic.ps1" -AutoConnect
exit /b %ERRORLEVEL%
