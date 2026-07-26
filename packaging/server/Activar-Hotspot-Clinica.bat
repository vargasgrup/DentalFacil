@echo off
setlocal EnableExtensions
title N&K DentalSoft - Hotspot clinica
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\enable_clinic_hotspot.ps1"
exit /b %ERRORLEVEL%
