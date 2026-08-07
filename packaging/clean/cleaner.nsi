; Desinstalador TOTAL N&K DentalSoft — zero residue (Server + Client + datos).
; Build: packaging\scripts\build_cleaner.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define PRODUCT_NAME "N&K DentalSoft - Desinstalador total"
!define PRODUCT_VERSION "4.0.0"
!define PRODUCT_VERSION_NUM "4.0.0.0"

Name "${PRODUCT_NAME}"
OutFile "..\..\dist\NKDentalSoft-Clean-All-x64.exe"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show
InstallDir "$TEMP\NKDentalSoft-Clean"
BrandingText "N&K DentalSoft · Limpieza total del sistema"

VIProductVersion "${PRODUCT_VERSION_NUM}"
VIAddVersionKey /LANG=0 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=0 "CompanyName" "N&K Systems"
VIAddVersionKey /LANG=0 "FileDescription" "Desinstalador total N&K DentalSoft (sin residuos)"
VIAddVersionKey /LANG=0 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${PRODUCT_VERSION}"

!define MUI_ICON "..\server\assets\icons\icon.ico"
!define MUI_UNICON "..\server\assets\icons\icon.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Desinstalador total — sin residuos"
!define MUI_WELCOMEPAGE_TEXT "Este asistente ELIMINA POR COMPLETO N&K DentalSoft de este equipo:$\r$\n$\r$\n• Server y Client (Program Files y carpetas custom, p. ej. D:\NKDentalSoft)$\r$\n• Datos clínicos en %ProgramData%\NKDentalSoft (base de datos, backups locales)$\r$\n• %LocalAppData% / %AppData% (todos los usuarios)$\r$\n• Claves de registro (Apps de Windows 11 / Uninstall)$\r$\n• Firewall, servicios, tareas programadas, atajos y Prefetch$\r$\n$\r$\nEsta acción NO SE PUEDE DESHACER.$\r$\nDespués podrá instalar Server y Client de nuevo."

!define MUI_FINISHPAGE_TITLE "Limpieza finalizada"
!define MUI_FINISHPAGE_TEXT "Revise el log en el Escritorio:$\r$\nNKDentalSoft-limpia.log$\r$\n$\r$\nSi algún archivo estaba en uso, reinicie el PC y ejecute de nuevo este desinstalador."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Section "Clean"
  MessageBox MB_ICONEXCLAMATION|MB_YESNO|MB_DEFBUTTON2 \
    "ADVERTENCIA: desinstalacion TOTAL.$\r$\n$\r$\nSe borrara N&K DentalSoft SIN DEJAR RESIDUOS, incluyendo:$\r$\n• Programas Server y Client$\r$\n• Base de datos y configuracion de la clinica$\r$\n• Registro de Windows / lista de Aplicaciones$\r$\n$\r$\n¿Continuar de todos modos?" \
    IDYES do_clean
  DetailPrint "Cancelado por el usuario."
  Abort
  do_clean:

  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 \
    "Confirme una vez mas.$\r$\n$\r$\n¿Eliminar TODOS los datos de N&K DentalSoft de este PC?" \
    IDYES do_clean2
  DetailPrint "Cancelado en la segunda confirmacion."
  Abort
  do_clean2:

  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=clean_all_installs.ps1" "..\scripts\clean_all_installs.ps1"

  DetailPrint "Ejecutando desinstalacion total (PowerShell)..."
  nsExec::ExecToLog 'cmd /c powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\clean_all_installs.ps1" -NoElevate'
  Pop $0
  DetailPrint "Codigo de salida: $0"

  ${If} $0 == "error"
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\clean_all_installs.ps1" -NoElevate' $0
    DetailPrint "ExecWait codigo: $0"
  ${EndIf}

  ${If} $0 == 0
    MessageBox MB_ICONINFORMATION|MB_OK \
      "Desinstalacion total completada.$\r$\n$\r$\nNo deben quedar residuos de N&K DentalSoft.$\r$\n$\r$\nLog: Escritorio\NKDentalSoft-limpia.log$\r$\n$\r$\nPuede instalar de nuevo:$\r$\n1) NKDentalSoft-Server-Setup-x64.exe$\r$\n2) NKDentalSoft-Client-Setup-x64.exe"
  ${Else}
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "Limpieza con avisos (codigo $0).$\r$\n$\r$\n1) Abra NKDentalSoft-limpia.log en el Escritorio$\r$\n2) REINICIE el PC$\r$\n3) Vuelva a ejecutar este desinstalador$\r$\n4) Luego instale Server y Client"
  ${EndIf}
SectionEnd
