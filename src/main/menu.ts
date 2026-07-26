/**
 * 애플리케이션 메뉴 — macOS 전용 네이티브 메뉴(BLUEPRINT §맥 이식).
 *
 * 왜 macOS만인가:
 *  · macOS는 메뉴바가 화면 상단 시스템 바에 고정돼 **모든 앱이 반드시 갖는다**. 메뉴를 안 주면
 *    Electron이 개발자용 기본 메뉴(Reload·Toggle DevTools 등)를 그대로 노출한다 — 완성된 Mac 앱답지 않다.
 *  · 기본 메뉴의 View에는 줌 role(Cmd+= · Cmd+- · Cmd+0)이 들어 있는데, 렌더러가 이미 같은 키로
 *    자체 줌(window.api.zoomBy)을 처리한다. 둘 다 발동하면 **한 번에 20%씩 튀는 이중 줌**이 된다.
 *    커스텀 메뉴에서 줌 role을 빼서 렌더러만 줌을 다루게 한다.
 *  · Windows/Linux는 현행 동작을 그대로 둔다(이 함수는 darwin이 아니면 아무것도 안 한다).
 *
 * appMenu·editMenu·windowMenu는 Electron 합성 role을 쓴다 — 앱 이름(번들명 자동)·표준 항목·
 * 한글 IME용 실행취소/다시실행/잘라내기/붙여넣기를 플랫폼 규약대로 채워준다.
 */
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'

const REPO_URL = 'https://github.com/icenovel-rgb/ICEFiction'

export function installAppMenu(isDev: boolean): void {
  // macOS가 아니면 손대지 않는다(Windows 기존 동작 보존).
  if (process.platform !== 'darwin') return

  // 개발 중에만 새로고침·개발자도구를 제공한다(배포본에는 없다).
  const devViewItems: MenuItemConstructorOptions[] = isDev
    ? [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' }
      ]
    : []

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' }, // ICEFiction · About · Hide · Quit … (번들명 자동)
    { role: 'editMenu' }, // 실행취소·다시실행·잘라내기·복사·붙여넣기·전체선택 (한글 IME)
    {
      label: '보기',
      submenu: [
        ...devViewItems,
        { role: 'togglefullscreen' } // 줌 role은 렌더러와 겹치므로 넣지 않는다.
      ]
    },
    { role: 'windowMenu' }, // 최소화·확대·앞으로 가져오기
    {
      role: 'help',
      submenu: [
        {
          label: 'ICEFiction 저장소 열기',
          click: () => void shell.openExternal(REPO_URL)
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
