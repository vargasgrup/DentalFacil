; NSIS installer — N&K DentalSoft Client (LAN station)
; Build: packaging/scripts/build_client.ps1
; ConnectClinic.cs network logic is FROZEN — this file is packaging-only.

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!define PRODUCT_NAME "N&K DentalSoft Client"
!define PRODUCT_PUBLISHER "N&K Systems"
!define PRODUCT_VERSION "4.0.0"
!define PRODUCT_VERSION_NUM "4.0.0.0"
!define PRODUCT_REG_ROOT "Software\NKDentalSoft\Client"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\NKDentalSoftClient"

Name "${PRODUCT_NAME}"
OutFile "..\..\dist\NKDentalSoft-Client-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\NKDentalSoft\Client"
InstallDirRegKey HKLM "${PRODUCT_REG_ROOT}" "InstallDir"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show
BrandingText "N&K DentalSoft · Instalación de estación cliente"

VIProductVersion "${PRODUCT_VERSION_NUM}"
VIAddVersionKey /LANG=0 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=0 "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=0 "FileDescription" "Instalador N&K DentalSoft Client"
VIAddVersionKey /LANG=0 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "LegalCopyright" "© N&K Systems"

!define MUI_ICON "icons\icon.ico"
!define MUI_UNICON "icons\icon.ico"
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Bienvenido a ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Este asistente instalará la estación LAN de N&K DentalSoft.$\r$\n$\r$\nEn el siguiente paso podrá elegir la unidad y la carpeta de instalación (por ejemplo D:\NKDentalSoft\Client).$\r$\n$\r$\nEsta PC debe poder alcanzar el servidor de la clínica en la red local."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Seleccione la carpeta de instalación.$\r$\n$\r$\n• Para instalar en otra unidad, escriba o examine una ruta (ej. D:\NKDentalSoft\Client).$\r$\n• Debe disponer de espacio libre y permisos de administrador."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Unidad y carpeta de destino"

!define MUI_FINISHPAGE_RUN "$INSTDIR\ConnectClinic.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "--force-prompt"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir N&K DentalSoft Client"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
FunctionEnd

Function un.onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
FunctionEnd

Section "Install"
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

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
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\N&K DentalSoft Client.lnk" "$INSTDIR\ConnectClinic.exe" "--auto-connect" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Client.lnk" "$INSTDIR\ConnectClinic.exe" "--auto-connect" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Cambiar servidor.lnk" "$INSTDIR\ConnectClinic.exe" "--force-prompt" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Reparar red LAN.lnk" "$INSTDIR\ConnectClinic.exe" "--repair-lan" "$INSTDIR\icons\icon.ico" 0 SW_SHOWNORMAL
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Desinstalar Client.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\icons\icon.ico" 0

  WriteRegStr HKLM "${PRODUCT_REG_ROOT}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_REG_ROOT}" "Version" "${PRODUCT_VERSION}"

  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\icons\icon.ico"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "VersionMajor" 4
  WriteRegDWORD HKLM "${UNINST_KEY}" "VersionMinor" 0

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" "$0"

  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  StrCpy $R0 "$2"
  StrCpy $R1 "$1"
  StrCpy $R2 "$0"
  StrLen $R3 $R1
  ${If} $R3 == 1
    StrCpy $R1 "0$R1"
  ${EndIf}
  StrLen $R3 $R2
  ${If} $R3 == 1
    StrCpy $R2 "0$R2"
  ${EndIf}
  WriteRegStr HKLM "${UNINST_KEY}" "InstallDate" "$R0$R1$R2"
SectionEnd

Section "Uninstall"
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  Delete "$DESKTOP\N&K DentalSoft Client.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft Client.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\Cambiar servidor.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\Reparar red LAN.lnk"
  Delete "$SMPROGRAMS\N&K DentalSoft\Desinstalar Client.lnk"
  RMDir "$SMPROGRAMS\N&K DentalSoft"

  RMDir /r "$INSTDIR"

  ; Cache / residuos del conector en el perfil (si existieran)
  RMDir /r "$LOCALAPPDATA\NKDentalSoft\Client"
  RMDir /r "$APPDATA\NKDentalSoft\Client"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_REG_ROOT}"
SectionEnd
