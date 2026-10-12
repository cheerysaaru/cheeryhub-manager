; Cheeryhub Desktop Installer
; NSIS installer with welcome, directory, install, and finish pages

!include "MUI2.nsh"

; General
Name "Cheeryhub"
OutFile "dist\Cheeryhub-Setup.exe"
InstallDir "$LOCALAPPDATA\Cheeryhub"
InstallDirRegKey HKCU "Software\Cheeryhub" ""
RequestExecutionLevel user

; Custom page texts
!define MUI_WELCOMEPAGE_TITLE "Welcome to the Cheeryhub Setup Wizard"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Cheeryhub.\n\nCheeryhub is a personal productivity manager that helps you track tasks, commitments, goals, and more.\n\nClick Next to continue."

!define MUI_FINISHPAGE_TITLE "Completing the Cheeryhub Setup Wizard"
!define MUI_FINISHPAGE_TEXT "Setup has finished installing Cheeryhub on your computer.\n\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Cheeryhub.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Cheeryhub"
!define MUI_FINISHPAGE_RUN_CHECKED 1

!define MUI_UNWELCOMEPAGE_TITLE "Welcome to the Cheeryhub Uninstall Wizard"
!define MUI_UNWELCOMEPAGE_TEXT "This wizard will guide you through the removal of Cheeryhub from your computer.\n\nClick Next to continue."

!define MUI_UNFINISHPAGE_TITLE "Completing the Cheeryhub Uninstall Wizard"
!define MUI_UNFINISHPAGE_TEXT "Cheeryhub has been removed from your computer.\n\nClick Finish to close this wizard."

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Files
Section "MainSection" SEC01
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"
  
  ; Create shortcuts
  CreateDirectory "$SMPROGRAMS\Cheeryhub"
  CreateShortcut "$SMPROGRAMS\Cheeryhub\Cheeryhub.lnk" "$INSTDIR\Cheeryhub.exe"
  CreateShortcut "$DESKTOP\Cheeryhub.lnk" "$INSTDIR\Cheeryhub.exe"
  
  ; Write uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"
  
  ; Registry
  WriteRegStr HKCU "Software\Cheeryhub" "" $INSTDIR
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub" "DisplayName" "Cheeryhub"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub" "DisplayVersion" "1.0.1"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub" "Publisher" "Cheeryhub"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub" "NoModify" "1"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub" "NoRepair" "1"
SectionEnd

; Uninstaller
Section "Uninstall"
  Delete "$INSTDIR\*.*"
  RMDir /r "$INSTDIR"
  Delete "$SMPROGRAMS\Cheeryhub\Cheeryhub.lnk"
  Delete "$DESKTOP\Cheeryhub.lnk"
  RMDir "$SMPROGRAMS\Cheeryhub"
  
  DeleteRegKey HKCU "Software\Cheeryhub"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cheeryhub"
SectionEnd