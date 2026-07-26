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
!define MUI_FINISHPAGE_RUN "$INSTDIR\ConnectClinic.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "--force-prompt"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir N&K DentalSoft Client"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Install"
  SetOutPath "$INSTDIR"
  File "ConnectClinic.exe"
  File "Open-Client.bat"
  File "Change-Server.bat"
  File /nonfatal "Connect-Clinic.ps1"
  File "/oname=repair_lan.ps1" "..\server\scripts\repair_lan.ps1"
  SetOutPath "$INSTDIR\icons"
  File /nonfatal "icons\icon.ico"
  File /nonfatal "icons\128x128.png"

  ; Best-effort: Private profile + firewall on Client PC too
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\repair_lan.ps1" -Quiet'

  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  ; Launch native EXE directly (no PowerShell flash)
  CreateShortCut "$DESKTOP\N&K DentalSoft Client.lnk" "$INSTDIR\ConnectClinic.exe" "--auto-connect" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Client.lnk" "$INSTDIR\ConnectClinic.exe" "--auto-connect" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Cambiar servidor.lnk" "$INSTDIR\ConnectClinic.exe" "--force-prompt" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Reparar red LAN.lnk" "$INSTDIR\ConnectClinic.exe" "--repair-lan" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\N&K DentalSoft Client.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Client.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\Cambiar servidor.lnk"
  RMDir "$SMPROGRAMS\N&K DentalSoft"
  RMDir /r "$INSTDIR"
SectionEnd
