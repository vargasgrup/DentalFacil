; NSIS installer — N&K DentalSoft Server (upgrade / overwrite + ARP / Windows Apps)
; Requires NSIS 3.x. Build via: packaging/scripts/build_server.ps1
; LAN scripts/hosts are product-frozen; this file only packaging UX + uninstall registry.

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!include "WinMessages.nsh"

!define PRODUCT_NAME "N&K DentalSoft Server"
!define PRODUCT_PUBLISHER "N&K Systems"
!define PRODUCT_VERSION "4.0.0"
!define PRODUCT_VERSION_NUM "4.0.0.0"
!define PRODUCT_REG_ROOT "Software\NKDentalSoft\Server"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\NKDentalSoftServer"

Name "${PRODUCT_NAME}"
OutFile "..\..\dist\NKDentalSoft-Server-Setup-x64.exe"
InstallDir "$PROGRAMFILES64\NKDentalSoft\Server"
; Record/recall install path (unidad + carpeta elegidas)
InstallDirRegKey HKLM "${PRODUCT_REG_ROOT}" "InstallDir"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show
BrandingText "N&K DentalSoft · Instalación del servidor de clínica"

VIProductVersion "${PRODUCT_VERSION_NUM}"
VIAddVersionKey /LANG=0 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=0 "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=0 "FileDescription" "Instalador N&K DentalSoft Server"
VIAddVersionKey /LANG=0 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=0 "LegalCopyright" "© N&K Systems"

!define MUI_ICON "assets\icons\icon.ico"
!define MUI_UNICON "assets\icons\icon.ico"
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Bienvenido a ${PRODUCT_NAME}"
!define MUI_WELCOMEPAGE_TEXT "Este asistente instalará el servidor N&K DentalSoft en el equipo.$\r$\n$\r$\nEn el siguiente paso podrá elegir la unidad y la carpeta de instalación (por ejemplo C:\Program Files\… o D:\NKDentalSoft\Server).$\r$\n$\r$\nSe recomienda cerrar N&K DentalSoft antes de continuar."

!define MUI_DIRECTORYPAGE_TEXT_TOP "Seleccione la carpeta de instalación.$\r$\n$\r$\n• Para instalar en otra unidad, escriba o examine una ruta (ej. D:\NKDentalSoft\Server).$\r$\n• Debe disponer de espacio libre y permisos de administrador.$\r$\n• En actualizaciones, se usará por defecto la última carpeta instalada."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Unidad y carpeta de destino"

!define MUI_FINISHPAGE_RUN "$INSTDIR\Open-UI.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir N&K DentalSoft en el navegador"
!define MUI_FINISHPAGE_LINK "Documentación de empaquetado / LAN"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/vargasgrup/DentalFacil"

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

Function StopRunningServer
  DetailPrint "Deteniendo servicio / proceso en ejecucion para permitir actualizacion..."
  SetOutPath "$PLUGINSDIR"
  File "scripts\stop_for_upgrade.ps1"
  File "scripts\rename_locked_exe.ps1"
  ; AllowRename: if the EXE stays locked, move it aside so File can write a new one
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop_for_upgrade.ps1" -WaitSeconds 45 -AllowRename'
  Pop $0
  DetailPrint "stop_for_upgrade exit=$0"
  ${If} $0 == 2
    MessageBox MB_ICONEXCLAMATION|MB_RETRYCANCEL \
      "No se pudo liberar nkdentalsoft-server.exe.$\r$\n$\r$\n1) Cierre la ventana de N&K DentalSoft$\r$\n2) En el Administrador de tareas finalice 'nkdentalsoft-server.exe'$\r$\n3) Pulse Reintentar$\r$\n$\r$\nO ejecute como Administrador:$\r$\n$INSTDIR\scripts\stop_for_upgrade.ps1" \
      IDRETRY retry_stop IDCANCEL abort_stop
    abort_stop:
      Abort "Instalacion cancelada: el servidor sigue en uso."
    retry_stop:
      Call StopRunningServer
  ${EndIf}
  Sleep 2000
FunctionEnd

Section "Install"
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  Call StopRunningServer

  SetOverwrite on
  SetOutPath "$INSTDIR"
  ClearErrors
  File /r "dist\nkdentalsoft-server\*.*"
  IfErrors 0 files_ok
    DetailPrint "Reintento de copia tras liberar archivos..."
    Call StopRunningServer
    Sleep 3000
    ClearErrors
    File /r "dist\nkdentalsoft-server\*.*"
    IfErrors 0 files_ok
      ; Last resort: rename locked EXE then copy again (dedicated ASCII script)
      DetailPrint "Renombrando EXE bloqueado y reintentando..."
      nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\rename_locked_exe.ps1" -InstallDir "$INSTDIR"'
      Pop $0
      DetailPrint "rename_locked_exe exit=$0"
      Sleep 2000
      ClearErrors
      File /r "dist\nkdentalsoft-server\*.*"
      IfErrors 0 files_ok
      MessageBox MB_ICONSTOP \
        "No se pudieron escribir archivos en:$\r$\n$INSTDIR$\r$\n$\r$\n1) Pulse Anular$\r$\n2) Cierre N&K DentalSoft$\r$\n3) En Administrador de tareas finalice nkdentalsoft-server.exe$\r$\n4) Vuelva a ejecutar el Setup."
      Abort "Error abriendo archivo para escritura (proceso en uso)."
  files_ok:

  File "Start-Server.bat"
  File "Open-UI.bat"
  File "Reparar-Red-LAN.bat"
  File "Activar-Hotspot-Clinica.bat"
  SetOutPath "$INSTDIR\scripts"
  File "scripts\stop_for_upgrade.ps1"
  File "scripts\rename_locked_exe.ps1"
  File "scripts\post_install_healthcheck.ps1"
  File "scripts\enable_clinic_hotspot.ps1"
  File /nonfatal "scripts\*.*"
  ; Also next to BAT for USB/manual copies that omit scripts\
  SetOutPath "$INSTDIR"
  File "/oname=enable_clinic_hotspot.ps1" "scripts\enable_clinic_hotspot.ps1"

  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\config"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\data"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\logs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\certs"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\uploads"
  CreateDirectory "$COMMONPROGRAMDATA\NKDentalSoft\updates"

  ; First install only — keep clinic secrets on upgrade
  IfFileExists "$COMMONPROGRAMDATA\NKDentalSoft\config\.env" skip_init 0
    DetailPrint "Primera instalacion: generando secretos y certificado TLS..."
    nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" --init-clinic'
    Pop $0
  skip_init:

  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="NKDentalSoft Server 8001" dir=in action=allow protocol=TCP localport=8001 profile=private,domain,public edge=yes'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft LAN Discovery 37020"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="NKDentalSoft LAN Discovery 37020" dir=in action=allow protocol=UDP localport=37020 profile=private,domain,public edge=yes'
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\repair_lan.ps1" -Quiet'

  ; Delete stale loose modules that shadowed the frozen PYZ (caused HTTPS-only / dead UI)
  Delete "$INSTDIR\server_entry.py"
  Delete "$INSTDIR\_internal\server_entry.py"
  Delete "$INSTDIR\windows_service.py"
  Delete "$INSTDIR\_internal\windows_service.py"

  ; Desktop-first: remove legacy Win32 service (zombie Session-0) and register Scheduled Task
  ; PowerShell 64-bit explícito (evita SysWOW64 roto en algunos PC)
  StrCpy $R9 "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists $R9 +2 0
    StrCpy $R9 "powershell.exe"
  DetailPrint "Configurando arranque de escritorio (sin servicio Windows zombie)..."
  nsExec::ExecToLog '"$R9" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\register_desktop_autostart.ps1" -InstallDir "$INSTDIR"'
  Pop $0
  DetailPrint "register_desktop_autostart exit=$0"
  ${If} $0 != 0
    DetailPrint "Reintento de arranque (antivirus / primer escaneo del EXE)..."
    Sleep 6000
    nsExec::ExecToLog '"$R9" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\register_desktop_autostart.ps1" -InstallDir "$INSTDIR"'
    Pop $0
    DetailPrint "register_desktop_autostart retry exit=$0"
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION \
      "El servidor quedo instalado, pero el arranque automatico fallo.$\r$\n$\r$\n1) Acepte UAC y ejecute como Administrador:$\r$\n$INSTDIR\scripts\repair_startup.cmd$\r$\n$\r$\n2) O use el acceso directo 'N&K DentalSoft' del Escritorio.$\r$\n$\r$\nLog: $COMMONPROGRAMDATA\NKDentalSoft\logs\install_autostart.log"
  ${EndIf}

  ; Desktop = open UI (what clinic staff expect)
  ; Start Menu = open UI + optional console for IT
  CreateDirectory "$SMPROGRAMS\N&K DentalSoft"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\N&K DentalSoft.lnk" "$INSTDIR\Open-UI.bat" "" "$INSTDIR\assets\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\N&K DentalSoft.lnk" "$INSTDIR\Open-UI.bat" "" "$INSTDIR\assets\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Servidor (consola).lnk" "$SYSDIR\cmd.exe" '/k ""$INSTDIR\Start-Server.bat""' "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Abrir en navegador.lnk" "$INSTDIR\Open-UI.bat" "" "$INSTDIR\assets\icons\icon.ico" 0 SW_SHOWMINIMIZED
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Reparar arranque.lnk" "$INSTDIR\scripts\repair_startup.cmd" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Reparar red LAN (Admin).lnk" "$INSTDIR\Reparar-Red-LAN.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$DESKTOP\Reparar red LAN - NKDentalSoft.lnk" "$INSTDIR\Reparar-Red-LAN.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Activar Hotspot clinica.lnk" "$INSTDIR\Activar-Hotspot-Clinica.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$DESKTOP\Activar Hotspot clinica - NKDentalSoft.lnk" "$INSTDIR\Activar-Hotspot-Clinica.bat" "" "$INSTDIR\assets\icons\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\N&K DentalSoft\Desinstalar Server.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\assets\icons\icon.ico" 0

  ; Remove obsolete desktop shortcut that launched the EXE and flashed closed
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"

  SetOutPath "$INSTDIR\assets\icons"
  File /nonfatal "assets\icons\icon.ico"
  File /nonfatal "assets\icons\256x256.png"

  Sleep 2000
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\scripts\post_install_healthcheck.ps1"'

  ; ── Registro Windows «Aplicaciones» (Configuración → Aplicaciones) ──
  WriteRegStr HKLM "${PRODUCT_REG_ROOT}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_REG_ROOT}" "Version" "${PRODUCT_VERSION}"

  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\assets\icons\icon.ico"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegStr HKLM "${UNINST_KEY}" "InstallDate" ""
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "VersionMajor" 4
  WriteRegDWORD HKLM "${UNINST_KEY}" "VersionMinor" 0

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" "$0"

  ; InstallDate YYYYMMDD
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  ; $2 = YYYY, $1 = MM? Check NSIS GetTime: day month year hour minute second dayofweek
  ; Actually FileFunc GetTime: local → $0 day, $1 month, $2 year
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

  DetailPrint "Deteniendo servidor y liberando archivos..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop_for_upgrade.ps1"'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" stop'
  nsExec::ExecToLog '"$INSTDIR\nkdentalsoft-server.exe" remove'
  nsExec::ExecToLog 'schtasks /Delete /TN "NKDentalSoft Server" /F'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server 8001"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft LAN Discovery 37020"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server EXE"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft Server EXE Out"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="NKDentalSoft ICMP Allow"'

  Delete "$DESKTOP\N&K DentalSoft.lnk"
  Delete "$DESKTOP\N&K DentalSoft Server.lnk"
  Delete "$DESKTOP\Reparar red LAN - NKDentalSoft.lnk"
  Delete "$DESKTOP\Activar Hotspot clinica - NKDentalSoft.lnk"
  RMDir /r "$SMPROGRAMS\N&K DentalSoft"

  ; Program files
  RMDir /r "$INSTDIR"

  ; Residuos típicos de shell / autostart (no borra historia clínica)
  Delete "$COMMONPROGRAMDATA\NKDentalSoft\HOTSPOT.txt"
  RMDir /r "$COMMONPROGRAMDATA\NKDentalSoft\logs"
  RMDir /r "$COMMONPROGRAMDATA\NKDentalSoft\updates"
  ; Datos clínicos (data + config + uploads + certs) se conservan a propósito.
  ; Limpieza total: dist\NKDentalSoft-Clean-All-x64.exe

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_REG_ROOT}"
SectionEnd
