; NSIS installer — N&K DentalSoft Server (supports upgrade / overwrite)
; Requires NSIS 3.x. Build via: packaging/scripts/build_server.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

Name "N&K DentalSoft Server"
OutFile "..\..\dist\NKDentalSoft-Server-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\NKDentalSoft\Server"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show

!define MUI_ICON "assets\icons\icon.ico"
!define MUI_UNICON "assets\icons\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Open-UI.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir N&K DentalSoft en el navegador"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Function StopRunningServer
  DetailPrint "Deteniendo servicio / proceso en ejecucion para permitir actualizacion..."
  SetOutPath "$PLUGINSDIR"
  File "scripts\stop_for_upgrade.ps1"
  File "scripts\rename_locked_exe.ps1"
  ; AllowRename: if the EXE stays locked, move it aside so File can write a new one
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop_for_upgrade.ps1" -WaitSeconds 45 -AllowRename'
  Pop $0
  DetailPrint "stop_for_upgrade exit=$0"
  ${If} $0 == 2
    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL \
      "No se pudo liberar nkdentalsoft-server.exe.$\r$\n$\r$\n1) Cierre la ventana de N&K DentalSoft$\r$\n2) En el Administrador de tareas finalice 'nkdentalsoft-server.exe'$\r$\n3) Pulse Reintentar$\r$\n$\r$\nO ejecute como Administrador:$\r$\n$INSTDIR\scripts\stop_for_upgrade.ps1" \
      IDRETRY retry_stop IDCANCEL abort_stop
    abort_stop:
      Abort "Instalacion cancelada: el servidor sigue en uso."
    retry_stop:
      Call StopRunningServer
  ${EndIf}
  Sleep 2000
FunctionEnd

Section "Install"
  Call StopRunningServer

  SetOverwrite on
  SetOutPath "$INSTDIR"
  ClearErrors
  File /r "dist\nkdentalsoft-server\*.*"
  IfErrors 0 files_ok
    DetailPrint "Reintento de copia tras liberar archivos..."
    Call StopRunningServer
    Sleep 3000
    ClearErrors
    File /r "dist\nkdentalsoft-server\*.*"
    IfErrors 0 files_ok
      ; Last resort: rename locked EXE then copy again (dedicated ASCII script)
      DetailPrint "Renombrando EXE bloqueado y reintentando..."
      nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\rename_locked_exe.ps1" -InstallDir "$INSTDIR"'
      Pop $0
      DetailPrint "rename_locked_exe exit=$0"
      Sleep 2000
      ClearErrors
      File /r "dist\nkdentalsoft-server\*.*"
      IfErrors 0 files_ok
      MessageBox MB_ICONSTOP \
        "No se pudieron escribir archivos en:$\r$\n$INSTDIR$\r$\n$\r$\n1) Pulse Anular$\r$\n2) Cierre N&K DentalSoft$\r$\n3) En Administrador de tareas finalice nkdentalsoft-server.exe$\r$\n4) Vuelva a ejecutar el Setup."
      Abort "Error abriendo archivo para escritura (proceso en uso)."
  files_ok:

  File "Start-Server.bat"
  File "Open-UI.bat"
  SetOutPath "$INSTDIR\scripts"
  File "scripts\stop_for_upgrade.ps1"
  File "scripts\rename_locked_exe.ps1"
  File "scripts\post_install_healthcheck.ps1"
  File /nonfatal "scripts\*.*"

  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\config"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\data"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\logs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\certs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\uploads"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\updates"

  ; First install only — keep clinic secrets on upgrade
  IfFileExists "$COMMONPROGRAMDATA\NKDentalSoft\config\.env" skip_init 0
    DetailPrint "Primera instalacion: generando secretos y certificado TLS..."
    nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --init-clinic'
    Pop $0
  skip_init:

  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="NKDentalSoft Server 8001" dir=in action=allow protocol=TCP localport=8001 profile=private,domain,public'

  ; Delete stale loose modules that shadowed the frozen PYZ (caused HTTPS-only / dead UI)
  Delete "$INSTDIR\server_entry.py"
  Delete "$INSTDIR\_internal\server_entry.py"
  Delete "$INSTDIR\windows_service.py"
  Delete "$INSTDIR\_internal\windows_service.py"

  ; Desktop-first: remove legacy Win32 service (zombie Session-0) and register Scheduled Task
  DetailPrint "Configurando arranque de escritorio (sin servicio Windows zombie)..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\register_desktop_autostart.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  DetailPrint "register_desktop_autostart exit=$0"
  ${If} $0 != 0
    DetailPrint "Reintento de arranque (antivirus / primer escaneo del EXE)..."
    Sleep 4000
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\register_desktop_autostart.ps1" -InstallDir "$INSTDIR"'
    Pop $0
    DetailPrint "register_desktop_autostart retry exit=$0"
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION \
      "El servidor no arranco automaticamente.$\r$\n$\r$\nEjecute como Administrador:$\r$\n$INSTDIR\scripts\repair_startup.cmd$\r$\n$\r$\nDetalle: $COMMONPROGRAMDATA\NKDentalSoft\logs\install_autostart.log"
  ${EndIf}

  ; Desktop = open UI (what clinic staff expect)
  ; Start Menu = open UI + optional console for IT
  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  CreateShortCut "$DESKTOP\N&K DentalSoft.lnk" "$INSTDIR\Open-UI.bat" "" "$INSTDIR\assets\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft.lnk" "$INSTDIR\Open-UI.bat" "" "$INSTDIR\assets\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Servidor (consola).lnk" "$SYSDIR\cmd.exe" '/k ""$INSTDIR\Start-Server.bat""' "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Abrir en navegador.lnk" "$INSTDIR\Open-UI.bat" "" "$INSTDIR\assets\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Reparar arranque.lnk" "$INSTDIR\scripts\repair_startup.cmd" "" "$INSTDIR\assets\icons\icon.ico" 0

  ; Remove obsolete desktop shortcut that launched the EXE and flashed closed
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"

  SetOutPath "$INSTDIR\assets\icons"
  File /nonfatal "assets\icons\icon.ico"
  File /nonfatal "assets\icons\256x256.png"

  Sleep 2000
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\scripts\post_install_healthcheck.ps1"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop_for_upgrade.ps1"'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" stop'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" remove'
  nsExec::ExecToLog 'schtasks /Delete /TN "NKDentalSoft Server" /F'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  Delete "$DESKTOP\N&K DentalSoft.lnk"
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"
  RMDir /r "$SMPROGRAMS\N&K DentalSoft"
  RMDir /r "$INSTDIR"
SectionEnd
