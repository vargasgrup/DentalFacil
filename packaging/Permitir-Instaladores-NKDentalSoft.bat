@echo off
setlocal EnableExtensions
title N&K DentalSoft - Permitir instaladores (firma)
REM Installs local code-signing CER + unblocks Setup EXEs. Run as Admin on clinic PC.

set "HERE=%~dp0"
set "PS1=%HERE%trust_codesign_and_allow.ps1"
if not exist "%PS1%" set "PS1=%HERE%scripts\trust_codesign_and_allow.ps1"
if not exist "%PS1%" set "PS1=%~dp0..\scripts\trust_codesign_and_allow.ps1"

if not exist "%PS1%" (
  echo No se encontro trust_codesign_and_allow.ps1
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
exit /b %ERRORLEVEL%
