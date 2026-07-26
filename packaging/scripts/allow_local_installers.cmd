@echo off
:: Ejecutar como Administrador para permitir los Setup de N&K DentalSoft
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0allow_local_installers.ps1"
