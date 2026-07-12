/**
 * Main 진입점 — 창 생성, 앱 수명주기, 커스텀 자료 프로토콜(BLUEPRINT §5).
 *
 * ice-asset:// 로 프로젝트 안 자료(이미지·동영상)를 서빙한다. 렌더러에 파일시스템 절대경로를
 * 노출하지 않으면서(contextIsolation) 미디어를 안전·효율적으로 표시하기 위함(§6.10).
 */
import { app, BrowserWindow, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerIpc } from './ipc'
import { libraryService } from './services/library'
import { projectService } from './services/project'

const isDev = !!process.env.ELECTRON_RENDERER_URL

// 특권 스킴 등록은 app ready 전에 해야 fetch·<video>·<img>가 정상 동작한다.
// ice-asset: 열린 책 안의 자료(§6.10). ice-cover: 서재 화면의 책 표지(열린 책이 없어도 서빙).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ice-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: 'ice-cover',
    // corsEnabled가 **반드시** 필요하다. 표지 아트를 <canvas>에 그려 toDataURL()로 내보내려면
    // crossOrigin='anonymous'로 받아야 캔버스가 오염되지 않는데, 커스텀 스킴은 기본적으로 CORS
    // 대상이 아니어서 이 권한이 없으면 "Cross origin requests are only supported for protocol
    // schemes: http, https, data…"로 **이미지 로드 자체가 깨진다**(실측).
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#2b2b2b',
    show: false,
    title: 'ICEFiction',
    icon: join(app.getAppPath(), 'icon.png'), // 제공된 ICEFiction 아이콘(창·작업표시줄)
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL as string)
  } else {
    win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // ice-asset://asset/<상대경로> → 프로젝트 루트 기준으로 해석해 파일 스트림 반환.
  protocol.handle('ice-asset', async (request) => {
    const root = projectService.rootDir
    if (!root) return new Response('no project', { status: 404 })
    try {
      const url = new URL(request.url)
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const abs = projectService.resolve(rel) // `..` 탈출은 resolve가 차단
      const res = await net.fetch(pathToFileURL(abs).toString())
      // PDF는 Chromium 내장 뷰어가 <iframe>에서 렌더하도록 content-type을 강제(다운로드 방지).
      if (rel.toLowerCase().endsWith('.pdf')) {
        const headers = new Headers(res.headers)
        headers.set('content-type', 'application/pdf')
        headers.delete('content-disposition')
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
      }
      return res
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })

  // ice-cover://book/<id> → 완성된 표지(제목 포함), ice-cover://art/<id> → AI가 그린 원본 아트(글자 없음).
  // 열린 책이 없어도 서재 화면에서 서빙된다. ?v=<mtime>은 캐시버스트.
  protocol.handle('ice-cover', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'book' && url.host !== 'art') {
        return new Response('bad request', { status: 400 })
      }
      const id = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      const abs =
        url.host === 'art'
          ? await libraryService.coverArtAbsPath(id)
          : await libraryService.coverAbsPath(id)
      if (!abs) return new Response('not found', { status: 404 })
      const res = await net.fetch(pathToFileURL(abs).toString())
      // CORS 허용이 **필수**다. 표지 아트를 <canvas>에 그린 뒤 toDataURL()로 내보내는데,
      // 헤더가 없으면 캔버스가 오염(tainted)돼 SecurityError로 저장이 통째로 막힌다(§7.6).
      const headers = new Headers(res.headers)
      headers.set('access-control-allow-origin', '*')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    } catch {
      return new Response('bad request', { status: 400 })
    }
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
