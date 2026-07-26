; NSIS installer skeleton — N&K DentalSoft Server
; Requires NSIS 3.x. Build after PyInstaller COLLECT output exists.
; Justification: NSIS is lighter than WiX for LAN clinic deploys, scriptable
; secrets generation, and firewall rules without MSBuild.

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

Name "N&K DentalSoft Server"
OutFile "..\..\dist\NKDentalSoft-Server-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\NKDentalSoft\Server"
RequestExecutionLevel admin
Unicode true

; Brand icon (multi-size ICO from packaging/scripts/generate_icons.py)
!define MUI_ICON "assets\icons\icon.ico"
!define MUI_UNICON "assets\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Install"
  SetOutPath "$INSTDIR"
  ; Expect pyinstaller output folder next to this script after build:
  ;   packaging/server/dist/nkdentalsoft-server/*
  File /r "dist\nkdentalsoft-server\*.*"
  File "windows_service.py"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\config"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\data"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\logs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\certs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\updates"

  ; Generate secrets + TLS (requires python on PATH during install — or embed scripts)
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --help'
  ; Preferred: call bundled scripts with embedded python from the onedir build
  nsExec::ExecToLog 'python "$INSTDIR\..\..\scripts\generate_production_secrets.py" --out "$COMMONPROGRAMDATA\NKDentalSoft\config\.env"'
  nsExec::ExecToLog 'python "$INSTDIR\..\..\scripts\generate_selfsigned_cert.py" --out-dir "$COMMONPROGRAMDATA\NKDentalSoft\certs"'

  ; Firewall — Private + Domain only
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="NKDentalSoft Server 8001" dir=in action=allow protocol=TCP localport=8001 profile=private,domain'

  ; Service registration (pywin32)
  nsExec::ExecToLog 'python "$INSTDIR\windows_service.py" --startup auto install'
  nsExec::ExecToLog 'python "$INSTDIR\windows_service.py" start'

  ; Post-install health
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\..\..\scripts\post_install_healthcheck.ps1"'

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Brand assets + shortcuts
  SetOutPath "$INSTDIR\assets\icons"
  File "assets\icons\icon.ico"
  File "assets\icons\256x256.png"
  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Server.lnk" "$INSTDIR\nkdentalsoft-server.exe" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$DESKTOP\N&K DentalSoft Server.lnk" "$INSTDIR\nkdentalsoft-server.exe" "" "$INSTDIR\assets\icons\icon.ico" 0
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'python "$INSTDIR\windows_service.py" stop'
  nsExec::ExecToLog 'python "$INSTDIR\windows_service.py" remove'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"
  RMDir /r "$SMPROGRAMS\N&K DentalSoft"
  RMDir /r "$INSTDIR"
SectionEnd
