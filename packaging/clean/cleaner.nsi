; Full wipe cleaner for prior N&K DentalSoft installs (Server + Client).
; Build: packaging\scripts\build_cleaner.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "N&K DentalSoft - Desinstalacion total"
OutFile "..\..\dist\NKDentalSoft-Clean-All-x64.exe"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show
InstallDir "$TEMP\NKDentalSoft-Clean"

!define MUI_ICON "..\server\assets\icons\icon.ico"
!define MUI_UNICON "..\server\assets\icons\icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Desinstalacion / limpieza total"
!define MUI_WELCOMEPAGE_TEXT "Este asistente ELIMINA por completo instalaciones anteriores de N&K DentalSoft:$\r$\n$\r$\n- Program Files\NKDentalSoft (Server y Client)$\r$\n- %ProgramData%\NKDentalSoft (incluye base de datos)$\r$\n- %LocalAppData%\NKDentalSoft (URL del Client)$\r$\n- Atajos, firewall, servicio y tarea programada$\r$\n$\r$\nDespues instale de nuevo Server y Client."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Clean"
  MessageBox MB_ICONEXCLAMATION|MB_YESNO \
    "Se eliminara POR COMPLETO N&K DentalSoft de este PC, incluyendo datos en ProgramData.$\r$\n$\r$\nContinuar?" \
    IDYES do_clean
  DetailPrint "Cancelado por el usuario."
  Abort
  do_clean:

  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=clean_all_installs.ps1" "..\scripts\clean_all_installs.ps1"

  DetailPrint "Ejecutando limpieza total (PowerShell)..."
  ; Use cmd.exe so path expansion is reliable; log stays on Desktop
  nsExec::ExecToLog 'cmd /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\clean_all_installs.ps1" -NoElevate'
  Pop $0
  DetailPrint "Codigo de salida PowerShell: $0"

  ; Also try direct ExecWait as fallback if nsExec returned weird
  ${If} $0 == "error"
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\clean_all_installs.ps1" -NoElevate' $0
    DetailPrint "ExecWait codigo: $0"
  ${EndIf}

  ${If} $0 == 0
    MessageBox MB_ICONINFORMATION|MB_OK \
      "Limpieza TOTAL completada.$\r$\n$\r$\nRevise el log en el Escritorio:$\r$\nNKDentalSoft-limpia.log$\r$\n$\r$\nLuego instale:$\r$\n1) NKDentalSoft-Server-Setup-x64.exe$\r$\n2) NKDentalSoft-Client-Setup-x64.exe"
  ${Else}
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "La limpieza termino con avisos (codigo $0).$\r$\n$\r$\n1) Abra NKDentalSoft-limpia.log en el Escritorio$\r$\n2) REINICIE el PC$\r$\n3) Vuelva a ejecutar este limpiador$\r$\n4) Instale Server y Client de nuevo"
  ${EndIf}
SectionEnd
