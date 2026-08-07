; Desinstalador TOTAL N&K DentalSoft (cero residuos).
; Build: packaging\scripts\build_cleaner.ps1

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!define PRODUCT_NAME "N&K DentalSoft - Desinstalador total"
!define PRODUCT_VERSION "4.0.2"
!define PRODUCT_VERSION_NUM "4.0.2.0"

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
VIAddVersionKey /LANG=0 "FileDescription" "Desinstalador total N&K DentalSoft"
VIAddVersionKey /LANG=0 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "LegalCopyright" "N&K Systems"

!define MUI_ICON "..\server\assets\icons\icon.ico"
!define MUI_UNICON "..\server\assets\icons\icon.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Desinstalador total"
!define MUI_WELCOMEPAGE_TEXT "Elimina por completo N&K DentalSoft de este PC:$\r$\n$\r$\n• Server y Client$\r$\n• Datos en ProgramData (base de datos)$\r$\n• Registro / lista de Aplicaciones$\r$\n• Firewall, tareas y atajos$\r$\n$\r$\nNo se puede deshacer."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "Spanish"

Var CleanExit
Var PsExe
Var ScriptPath

Section "Clean"
  MessageBox MB_ICONEXCLAMATION|MB_YESNO|MB_DEFBUTTON2 \
    "Se eliminara TODO N&K DentalSoft (programa + datos de la clinica).$\r$\n$\r$\n¿Continuar?" \
    IDYES do_clean
  Abort
  do_clean:

  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=clean_all_installs.ps1" "..\scripts\clean_all_installs.ps1"

  ; Ruta absoluta a PowerShell 64-bit (evita SysWOW64 roto / nsExec con comillas)
  StrCpy $PsExe "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists $PsExe +2 0
    StrCpy $PsExe "powershell.exe"

  StrCpy $ScriptPath "$PLUGINSDIR\clean_all_installs.ps1"
  IfFileExists $ScriptPath 0 missing_script

  DetailPrint "PowerShell: $PsExe"
  DetailPrint "Script: $ScriptPath"
  DetailPrint "Ejecutando desinstalacion total..."

  ; Este instalador ya pide UAC (RequestExecutionLevel admin).
  ; -NoElevate evita un segundo prompt; el script sale 3 si no es admin.
  ClearErrors
  StrCpy $CleanExit 1
  ExecWait '"$PsExe" -NoProfile -ExecutionPolicy Bypass -NoLogo -NonInteractive -File "$ScriptPath" -NoElevate' $CleanExit
  DetailPrint "Codigo de salida PowerShell: $CleanExit"

  ${If} $CleanExit == 0
    MessageBox MB_ICONINFORMATION|MB_OK \
      "Desinstalacion total completada.$\r$\n$\r$\nLogs:$\r$\n• Escritorio\NKDentalSoft-limpia.log$\r$\n• %TEMP%\NKDentalSoft-limpia.log$\r$\n$\r$\nYa puede instalar Server y Client de nuevo."
  ${ElseIf} $CleanExit == 3
    MessageBox MB_ICONSTOP|MB_OK \
      "Se necesita Administrador (UAC).$\r$\n$\r$\nCierre y vuelva a ejecutar este desinstalador,$\r$\ny acepte el aviso de Control de cuentas de usuario."
  ${ElseIf} $CleanExit == 2
    MessageBox MB_ICONSTOP|MB_OK \
      "No se pudo elevar a Administrador.$\r$\nEjecute el desinstalador con clic derecho > Ejecutar como administrador."
  ${Else}
    MessageBox MB_ICONEXCLAMATION|MB_OK \
      "Limpieza incompleta (codigo $CleanExit).$\r$\n$\r$\n1) Abra NKDentalSoft-limpia.log (Escritorio)$\r$\n2) Cierre Server / Client / navegador$\r$\n3) REINICIE el PC$\r$\n4) Vuelva a ejecutar este desinstalador como Administrador"
  ${EndIf}
  Goto end_clean

  missing_script:
    MessageBox MB_ICONSTOP "No se encontro clean_all_installs.ps1 en el instalador."
    Abort

  end_clean:
SectionEnd
