@echo off
REM Quick fix for an already-installed Server PC (no full reinstall).
REM Run as Administrator once.

set INSTALL=%ProgramFiles%\NKDentalSoft\Server
if not exist "%INSTALL%\nkdentalsoft-server.exe" (
  echo No se encontro el servidor en %INSTALL%
  pause
  exit /b 1
)

echo Copiando lanzadores actualizados...
copy /Y "%~dp0..\Open-UI.bat" "%INSTALL%\Open-UI.bat" >nul
copy /Y "%~dp0..\Start-Server.bat" "%INSTALL%\Start-Server.bat" >nul

echo Asegurando servicio Windows...
"%INSTALL%\nkdentalsoft-server.exe" --startup auto install
"%INSTALL%\nkdentalsoft-server.exe" start

echo Creando acceso directo en el escritorio ^(abre el navegador^)...
powershell -NoProfile -Command ^
  "$ws=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $s=$ws.CreateShortcut((Join-Path $d 'N&K DentalSoft.lnk')); $s.TargetPath='%INSTALL%\Open-UI.bat'; $s.IconLocation='%INSTALL%\assets\icons\icon.ico'; $s.WindowStyle=7; $s.Save()"

del /F /Q "%USERPROFILE%\Desktop\N&K DentalSoft Server.lnk" 2>nul
del /F /Q "%PUBLIC%\Desktop\N&K DentalSoft Server.lnk" 2>nul

echo.
echo Listo. Use el icono "N&K DentalSoft" del escritorio para abrir el sistema.
echo.
pause
