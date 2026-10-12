; Cheeryhub Desktop Installer - Custom NSIS Include
; This file is included by electron-builder's NSIS target to customize the installer pages

; Welcome page with custom text
!define MUI_WELCOMEPAGE_TITLE "Welcome to the Cheeryhub Setup Wizard"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Cheeryhub.\n\nCheeryhub is a personal productivity manager that helps you track tasks, commitments, goals, and more.\n\nClick Next to continue."

; Finish page with "Run Cheeryhub" checkbox
!define MUI_FINISHPAGE_TITLE "Completing the Cheeryhub Setup Wizard"
!define MUI_FINISHPAGE_TEXT "Setup has finished installing Cheeryhub on your computer.\n\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Cheeryhub.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Cheeryhub"
!define MUI_FINISHPAGE_RUN_TEXT_NOTCHECKED "Launch Cheeryhub"
!define MUI_FINISHPAGE_RUN_CHECKED 1

; Welcome page for uninstaller
!define MUI_UNWELCOMEPAGE_TITLE "Welcome to the Cheeryhub Uninstall Wizard"
!define MUI_UNWELCOMEPAGE_TEXT "This wizard will guide you through the removal of Cheeryhub from your computer.\n\nClick Next to continue."

; Finish page for uninstaller
!define MUI_UNFINISHPAGE_TITLE "Completing the Cheeryhub Uninstall Wizard"
!define MUI_UNFINISHPAGE_TEXT "Cheeryhub has been removed from your computer.\n\nClick Finish to close this wizard."