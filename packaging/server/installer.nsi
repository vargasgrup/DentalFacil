; NSIS installer — N&K DentalSoft Server
; Requires NSIS 3.x. Build via: packaging/scripts/build_server.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

Name "N&K DentalSoft Server"
OutFile "..\..\dist\NKDentalSoft-Server-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\NKDentalSoft\Server"
RequestExecutionLevel admin
Unicode true

!define MUI_ICON "assets\icons\icon.ico"
!define MUI_UNICON "assets\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "dist\nkdentalsoft-server\*.*"

  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\config"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\data"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\logs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\certs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\uploads"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\updates"

  ; Secrets + TLS (LAN IP auto-detected inside the EXE)
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --init-clinic'
  Pop $0

  ; Firewall — Private + Domain only
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="NKDentalSoft Server 8001" dir=in action=allow protocol=TCP localport=8001 profile=private,domain'

  ; Windows Service
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --startup auto install'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" start'
  Pop $0

  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  ; BAT launcher keeps the console open if startup fails (shows the real error)
  File "Start-Server.bat"
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Server.lnk" "$INSTDIR\Start-Server.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$DESKTOP\N&K DentalSoft Server.lnk" "$INSTDIR\Start-Server.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Abrir en navegador.lnk" "https://127.0.0.1:8001/" "" "$INSTDIR\assets\icons\icon.ico" 0

  SetOutPath "$INSTDIR\assets\icons"
  File /nonfatal "assets\icons\icon.ico"
  File /nonfatal "assets\icons\256x256.png"

  Sleep 4000
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\scripts\post_install_healthcheck.ps1"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" stop'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" remove'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"
  RMDir /r "$SMPROGRAMS\N&K DentalSoft"
  RMDir /r "$INSTDIR"
SectionEnd
