; ICEFiction NSIS 설치 커스터마이즈
; 설치 마법사에 "바탕화면에 바로가기 만들기" 체크박스 페이지를 추가해 사용자에게 물어본다.
; electron-builder가 buildResources(build/)의 installer.nsh를 자동 포함한다.
; 이 파일은 설치본·제거본 빌드에 모두 포함되므로, 페이지 코드는 설치본 전용(!ifndef BUILD_UNINSTALLER)으로 가둔다.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var IceDesktopCheckbox
  Var IceCreateDesktop

  ; 설치 폴더 선택 페이지 뒤에 커스텀 페이지를 끼운다.
  !macro customPageAfterChangeDir
    Page custom IceDesktopPageCreate IceDesktopPageLeave
  !macroend

  Function IceDesktopPageCreate
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 24u "설치 후 만들 바로가기를 선택하세요."
    Pop $1
    ${NSD_CreateCheckbox} 0 30u 100% 12u "바탕화면에 ICEFiction 바로가기 만들기"
    Pop $IceDesktopCheckbox
    ${NSD_Check} $IceDesktopCheckbox ; 기본 체크됨
    nsDialogs::Show
  FunctionEnd

  Function IceDesktopPageLeave
    ${NSD_GetState} $IceDesktopCheckbox $IceCreateDesktop
  FunctionEnd

  ; 사용자가 체크했을 때만 바탕화면 바로가기 생성(yml의 createDesktopShortcut는 false).
  !macro customInstall
    ${If} $IceCreateDesktop == ${BST_CHECKED}
      CreateShortcut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
  !macroend
!endif

; 제거 시 바탕화면 바로가기도 정리(제거본 빌드에서 사용).
!macro customUnInstall
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
!macroend
