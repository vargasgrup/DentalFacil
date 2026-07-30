; Standalone cleaner for prior N&K DentalSoft installs (Server + Client).
; Does NOT modify LAN connection logic — only removes leftovers.
; Build: packaging\scripts\build_cleaner.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

Name "N&K DentalSoft — Limpiar instalaciones"
OutFile "..\..\dist\NKDentalSoft-Clean-All-x64.exe"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show

!define MUI_ICON "..\server\assets\icons\icon.ico"
!define MUI_UNICON "..\server\assets\icons\icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Limpiar instalaciones anteriores"
!define MUI_WELCOMEPAGE_TEXT "Este asistente detiene Server/Client, elimina carpetas de programa, atajos, URL guardada del Client, reglas de firewall y tareas programadas.$\r$\n$\r$\nPor defecto CONSERVA la base de datos de la clinica en ProgramData.$\r$\n$\r$\nDespues podra instalar de nuevo Server y Client desde cero."

Var WipeData
Var RadioKeep
Var RadioWipe
Var Dialog

!insertmacro MUI_PAGE_WELCOME
Page custom WipePageCreate WipePageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Function WipePageCreate
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 40u "Seleccione el modo de limpieza:"
  Pop $0

  ${NSD_CreateRadioButton} 0 50u 100% 28u "Limpieza estandar (recomendado) — conserva datos de pacientes en ProgramData"
  Pop $RadioKeep
  ${NSD_Check} $RadioKeep

  ${NSD_CreateRadioButton} 0 90u 100% 40u "Limpieza TOTAL — tambien borra %ProgramData%\NKDentalSoft (base de datos y secretos)"
  Pop $RadioWipe

  nsDialogs::Show
FunctionEnd

Function WipePageLeave
  ${NSD_GetState} $RadioWipe $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $WipeData "1"
  ${Else}
    StrCpy $WipeData "0"
  ${EndIf}
FunctionEnd

Section "Clean"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "..\scripts\clean_all_installs.ps1"

  DetailPrint "Ejecutando limpieza..."
  ${If} $WipeData == "1"
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\clean_all_installs.ps1" -WipeClinicData'
  ${Else}
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\clean_all_installs.ps1"'
  ${EndIf}
  Pop $0
  DetailPrint "Codigo de salida: $0"
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "La limpieza termino con avisos (codigo $0).$\r$\nSi quedan carpetas en Program Files, reinicie el PC y vuelva a ejecutar este limpiador."
  ${Else}
    MessageBox MB_ICONINFORMATION|MB_OK "Limpieza completada.$\r$\n$\r$\nAhora instale:$\r$\n1) NKDentalSoft-Server-Setup-x64.exe$\r$\n2) NKDentalSoft-Client-Setup-x64.exe"
  ${EndIf}
SectionEnd
