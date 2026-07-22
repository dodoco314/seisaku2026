!macro customUnInstall
  ; Windows Credential Managerからトークンを削除
  ExecWait '"$INSTDIR\mimamorukun.exe" --cleanup-credentials'
!macroend