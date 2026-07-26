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
!define MUI_FINISHPAGE_RUN "$INSTDIR\Start-Server.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Iniciar N&K DentalSoft Server ahora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

; Stop service + kill running EXE before any File write (upgrade path)
Function StopRunningServer
  DetailPrint "Deteniendo servicio / proceso en ejecucion para permitir actualizacion..."
  ; Prefer script bundled next to this .nsi (copied into INSTDIR later; use source tree during File)
  ; During install we first extract helper scripts to $PLUGINSDIR / temp
  SetOutPath "$PLUGINSDIR"
  File "scripts\stop_for_upgrade.ps1"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop_for_upgrade.ps1"'
  Pop $0
  DetailPrint "stop_for_upgrade exit=$0"
  ${If} $0 == 2
    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL \
      "No se pudo liberar nkdentalsoft-server.exe.$\r$\n$\r$\nCierre la ventana negra del Servidor (si esta abierta) y el Administrador de tareas, luego pulse Reintentar." \
      IDRETRY retry_stop IDCANCEL abort_stop
    abort_stop:
      Abort "Instalacion cancelada: el servidor sigue en uso."
    retry_stop:
      Call StopRunningServer
  ${EndIf}
  Sleep 1500
FunctionEnd

Section "Install"
  ; CRITICAL for upgrades: unlock files before overwrite
  Call StopRunningServer

  SetOverwrite on
  SetOutPath "$INSTDIR"
  ; Retry copy if AV briefly locks a DLL
  ClearErrors
  File /r "dist\nkdentalsoft-server\*.*"
  IfErrors 0 files_ok
    DetailPrint "Reintento de copia tras liberar archivos..."
    Call StopRunningServer
    Sleep 2000
    ClearErrors
    File /r "dist\nkdentalsoft-server\*.*"
    IfErrors 0 files_ok
      MessageBox MB_ICONSTOP \
        "No se pudieron escribir archivos en:$\r$\n$INSTDIR$\r$\n$\r$\nCierre N&K DentalSoft Server y vuelva a ejecutar el instalador."
      Abort "Error abriendo archivo para escritura (proceso en uso)."
  files_ok:

  File "Start-Server.bat"
  SetOutPath "$INSTDIR\scripts"
  File "scripts\stop_for_upgrade.ps1"
  File "scripts\post_install_healthcheck.ps1"
  File /nonfatal "scripts\*.*"

  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\config"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\data"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\logs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\certs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\uploads"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\updates"

  ; Only generate secrets on first install — preserve clinic .env on upgrade
  IfFileExists "$COMMONPROGRAMDATA\NKDentalSoft\config\.env" skip_init 0
    DetailPrint "Primera instalacion: generando secretos y certificado TLS..."
    nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --init-clinic'
    Pop $0
  skip_init:

  ; Firewall — Private + Domain only
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="NKDentalSoft Server 8001" dir=in action=allow protocol=TCP localport=8001 profile=private,domain'

  ; (Re)register Windows Service pointing at the new EXE
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" stop'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" remove'
  Pop $0
  Sleep 1000
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --startup auto install'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" start'
  Pop $0

  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Server.lnk" "$INSTDIR\Start-Server.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$DESKTOP\N&K DentalSoft Server.lnk" "$INSTDIR\Start-Server.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Abrir en navegador.lnk" "https://127.0.0.1:8001/" "" "$INSTDIR\assets\icons\icon.ico" 0

  SetOutPath "$INSTDIR\assets\icons"
  File /nonfatal "assets\icons\icon.ico"
  File /nonfatal "assets\icons\256x256.png"

  Sleep 3000
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\scripts\post_install_healthcheck.ps1"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop_for_upgrade.ps1"'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" stop'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" remove'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"
  RMDir /r "$SMPROGRAMS\N&K DentalSoft"
  RMDir /r "$INSTDIR"
  ; Keep ProgramData (clinic DB / secrets) on uninstall unless user deletes manually
SectionEnd
