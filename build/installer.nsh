; Detect and offer to uninstall old PCConnect before installing
!macro customInit
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PCConnect" "UninstallString"
  ${If} $0 != ""
    MessageBox MB_OKCANCEL|MB_ICONQUESTION "检测到已安装的旧版 PCConnect，是否卸载并继续？" /SD IDOK IDCANCEL skip
    ExecWait '$0 /S'
    skip:
  ${EndIf}

  IfFileExists "$PROGRAMFILES\PCConnect\*.*" 0 noLegacy
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "检测到旧版绿版文件夹：$PROGRAMFILES\PCConnect，建议手动删除后继续安装。是否继续？" /SD IDOK IDCANCEL abort
    Goto done
    abort:
    Quit
    noLegacy:
    done:
!macroend
