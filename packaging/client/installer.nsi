; NSIS installer — N&K DentalSoft Client (LAN station for caja/doctor/asistente)
; Does not require Rust. Opens Edge --app to the clinic Server URL.
; Build: packaging/scripts/build_client.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

Name "N&K DentalSoft Client"
OutFile "..\..\dist\NKDentalSoft-Client-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\NKDentalSoft\Client"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show

!define MUI_ICON "icons\icon.ico"
!define MUI_UNICON "icons\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Open-Client.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir N&K DentalSoft Client"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Install"
  SetOutPath "$INSTDIR"
  File "Open-Client.bat"
  File "Change-Server.bat"
  File "Connect-Clinic.ps1"
  SetOutPath "$INSTDIR\ui"
  File /r "ui\*.*"
  SetOutPath "$INSTDIR\icons"
  File /nonfatal "icons\icon.ico"
  File /nonfatal "icons\128x128.png"

  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  CreateShortCut "$DESKTOP\N&K DentalSoft Client.lnk" "$INSTDIR\Open-Client.bat" "" "$INSTDIR\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Client.lnk" "$INSTDIR\Open-Client.bat" "" "$INSTDIR\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Cambiar servidor.lnk" "$INSTDIR\Change-Server.bat" "" "$INSTDIR\icons\icon.ico" 0

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\N&K DentalSoft Client.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Client.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\Cambiar servidor.lnk"
  RMDir "$SMPROGRAMS\N&K DentalSoft"
  RMDir /r "$INSTDIR"
SectionEnd
