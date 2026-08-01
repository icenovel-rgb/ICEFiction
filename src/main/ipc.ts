/**
 * IPC 핸들러 — 렌더러의 window.api 호출을 main 서비스로 잇는다.
 *
 * 렌더러는 파일시스템에 직접 접근하지 않는다(contextIsolation). 모든 IO는 여기를 거친다 —
 * 보안 + Mac 이식성(BLUEPRINT §5). 서재/책장은 LibraryService, 열린 책은 ProjectService.
 */
import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AIConfig,
  ChatMessage,
  DocType,
  ImageGenRequest,
  SaveDocRequest,
  SearchAllOptions
} from '../shared/types'
import { AIError } from './ai/errors'
import { imageService } from './ai/image'
import { aiService } from './services/ai'
import { COVER_ART, libraryService } from './services/library'
import { projectService } from './services/project'
import { updateService } from './services/update'

export function registerIpc(): void {
  // ── 서재(책장) ──
  ipcMain.handle('library:get', async () => libraryService.info())

  ipcMain.handle('library:choose', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '서재로 사용할 폴더 선택 (모든 소설이 이 안에 보관됩니다)',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    await libraryService.setLibraryDir(res.filePaths[0])
    return libraryService.info()
  })

  ipcMain.handle('library:createBook', async (_e, title: string) =>
    libraryService.createBook(title)
  )

  ipcMain.handle('library:openBook', async (_e, id: string) => libraryService.openBook(id))

  ipcMain.handle('library:renameBook', async (_e, id: string, newTitle: string) =>
    libraryService.renameBook(id, newTitle)
  )

  ipcMain.handle('library:deleteBook', async (_e, id: string) => libraryService.deleteBook(id))

  ipcMain.handle('library:setCover', async (_e, id: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '표지 이미지 선택',
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return libraryService.info()
    return libraryService.setBookCover(id, res.filePaths[0])
  })

  ipcMain.handle('library:setCoverData', async (_e, id: string, base64Png: string) =>
    libraryService.setBookCoverData(id, base64Png)
  )

  ipcMain.handle('library:removeCover', async (_e, id: string) =>
    libraryService.removeBookCover(id)
  )

  ipcMain.handle('library:bookMeta', async (_e, id: string) => libraryService.bookMeta(id))

  ipcMain.handle('library:setImageStyle', async (_e, id: string, style: string) =>
    libraryService.setBookImageStyle(id, style)
  )

  ipcMain.handle('library:reorder', async (_e, orderedIds: string[]) =>
    libraryService.reorderBooks(orderedIds)
  )

  ipcMain.handle('library:reveal', async () => {
    await shell.openPath(await libraryService.libraryDir())
  })

  // ── 업데이트 확인(§9.1) ──
  ipcMain.handle('app:version', async () => app.getVersion())

  ipcMain.handle('update:check', async () => updateService.check(app.getVersion()))

  // 다운로드는 **기본 브라우저**로 넘긴다 — 앱이 설치 파일을 직접 받아 실행하지 않는다.
  // 무엇을 받는지 사용자가 브라우저에서 보고 판단하게 두는 편이 안전하다.
  ipcMain.handle('os:openExternal', async (_e, url: string) => {
    if (!/^https:\/\/(github\.com|api\.github\.com|objects\.githubusercontent\.com|icenovel\.com)\//i.test(url)) {
      throw new Error(`허용되지 않는 링크입니다: ${url}`)
    }
    await shell.openExternal(url)
  })

  // ── 열린 책 ──
  ipcMain.handle('project:refreshTree', async () => projectService.buildTree())

  ipcMain.handle('doc:read', async (_e, path: string) => projectService.readDoc(path))

  ipcMain.handle('doc:save', async (_e, req: SaveDocRequest) => projectService.saveDoc(req))

  ipcMain.handle('doc:create', async (_e, dir: string, type: DocType, title: string) =>
    projectService.createDoc(dir, type, title)
  )

  ipcMain.handle('doc:createFolder', async (_e, dir: string, name: string) =>
    projectService.createFolder(dir, name)
  )

  ipcMain.handle('doc:trash', async (_e, path: string) => projectService.trashEntry(path))

  ipcMain.handle('doc:rename', async (_e, path: string, newName: string) =>
    projectService.renameEntry(path, newName)
  )

  // 문서(챕터) 표지 — 제목까지 얹은 완성본은 렌더러가 캔버스로 만들어 넘긴다(§7.6).
  // 프론트매터(cover/cover_art) 기록은 렌더러가 자동 저장으로 한다 — main이 같은 파일을
  // 동시에 고치면 편집 중인 본문과 경합한다.
  ipcMain.handle('doc:setCover', async (_e, docPath: string, base64Png: string) =>
    projectService.saveDocCover(docPath, base64Png)
  )

  ipcMain.handle('doc:removeCover', async (_e, docPath: string) =>
    projectService.removeDocCover(docPath)
  )

  ipcMain.handle('os:reveal', async (_e, path: string) => {
    shell.showItemInFolder(projectService.resolve(path))
  })

  ipcMain.handle('os:openProjectFolder', async () => {
    const root = projectService.rootDir
    if (root) await shell.openPath(root)
  })

  ipcMain.handle('assets:ingest', async (_e, absPaths: string[], targetDir?: string) =>
    projectService.ingest(absPaths, targetDir)
  )

  ipcMain.handle('assets:list', async () => projectService.listAssets())

  ipcMain.handle('assets:trash', async (_e, relPath: string) => projectService.trashAsset(relPath))

  // PDF를 별도 창(Chromium 내장 PDF 뷰어)으로 연다 — 커스텀 스킴 <iframe>은 렌더 안 되므로 file:// 로.
  ipcMain.handle('pdf:open', async (_e, relPath: string) => {
    const abs = projectService.resolve(relPath) // `..` 탈출은 resolve가 차단
    const win = new BrowserWindow({
      width: 940,
      height: 1000,
      title: basename(abs),
      autoHideMenuBar: true,
      backgroundColor: '#525659',
      webPreferences: { plugins: true }
    })
    await win.loadURL(pathToFileURL(abs).toString())
  })

  ipcMain.handle('md:convertEmbeds', async () => projectService.convertLegacyEmbeds())

  ipcMain.handle('search:all', async (_e, query: string, opts?: SearchAllOptions) =>
    projectService.searchAll(query, opts)
  )

  ipcMain.handle(
    'search:replaceAll',
    async (_e, query: string, replacement: string, opts?: SearchAllOptions) =>
      projectService.replaceAll(query, replacement, opts)
  )

  ipcMain.handle('assets:import', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: '이미지·자료 추가',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '이미지·동영상·문서',
          extensions: [
            'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp',
            'mp4', 'webm', 'mov', 'mkv', 'm4v',
            'pdf', 'txt', 'md', 'markdown', 'csv', 'json', 'log'
          ]
        },
        { name: '모든 파일', extensions: ['*'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return []
    const r = await projectService.ingest(res.filePaths)
    return r.imported
  })

  // ── AI ──
  ipcMain.handle(
    'ai:buildContext',
    async (
      _e,
      currentPath: string | null,
      currentBody: string,
      includeAssets?: boolean,
      includeStyle?: boolean
    ) => projectService.buildAiContext(currentPath, currentBody, includeAssets, includeStyle)
  )
  ipcMain.handle('ai:attachmentInfo', async (_e, relPath: string) =>
    projectService.attachmentInfo(relPath)
  )
  // 열람 프로토콜(§7.5) — AI가 요청한 파일을 읽어 첨부로 돌려준다(경로 검증은 서비스가 한다).
  ipcMain.handle('ai:readFiles', async (_e, paths: string[]) => projectService.readForAi(paths))
  ipcMain.handle(
    'ai:listModels',
    async (_e, draft: Pick<AIConfig, 'kind' | 'baseUrl' | 'cliCommand'>, apiKey?: string) =>
      aiService.listModels(draft, apiKey)
  )
  ipcMain.handle('ai:getConfig', async () => aiService.getConfig())
  ipcMain.handle('ai:setConfig', async (_e, cfg: AIConfig, apiKey?: string) =>
    aiService.setConfig(cfg, apiKey)
  )
  ipcMain.handle('ai:check', async () => aiService.check())
  ipcMain.handle('ai:generate', async (e, requestId: string, messages: ChatMessage[]) => {
    // 스트리밍은 이벤트로 흘리고, handle은 시작 즉시 반환.
    void aiService.generate(requestId, messages, e.sender)
  })
  ipcMain.on('ai:cancel', (_e, requestId: string) => aiService.cancel(requestId))

  // ── 이미지 생성(§7.6) ──
  ipcMain.handle('image:engines', async () => imageService.engines())

  ipcMain.handle('image:generate', async (e, req: ImageGenRequest) => {
    // 스트리밍(진행 로그)은 이벤트로 흘리고 handle은 즉시 반환한다.
    void runImageGeneration(req, e.sender)
  })

  ipcMain.on('image:cancel', (_e, requestId: string) => {
    imageJobs.get(requestId)?.abort()
    imageJobs.delete(requestId)
  })
}

/** 진행 중인 이미지 생성 작업(취소용). */
const imageJobs = new Map<string, AbortController>()

/**
 * 이미지 생성 실행 — 대상(문서/표지)에 따라 저장 위치를 정하고, 끝나면 결과를 렌더러로 보낸다.
 *  · 문서: <프로젝트>/assets/images/<문서명>.png → 프론트매터 images에 붙일 수 있게 상대경로 반환
 *  · 표지: <책폴더>/cover-art.png (글자 없는 원본 아트) → 렌더러가 제목을 얹어 cover.png로 저장
 */
async function runImageGeneration(req: ImageGenRequest, sender: WebContents): Promise<void> {
  const ac = new AbortController()
  imageJobs.set(req.requestId, ac)
  const progress = (text: string): void => {
    if (!sender.isDestroyed()) sender.send('image:progress', { requestId: req.requestId, text })
  }

  try {
    let destAbs: string
    let relOrName: string
    let url: string

    if (req.target.kind === 'cover') {
      const folder = await libraryService.bookFolder(req.target.bookId)
      destAbs = join(folder, COVER_ART)
      relOrName = COVER_ART
      url = `ice-cover://art/${encodeURIComponent(req.target.bookId)}`
    } else if (req.target.kind === 'docCover') {
      // 문서 표지 아트(글자 없음) — 렌더러가 제목을 얹어 doc:setCover로 완성본을 저장한다.
      const { art } = projectService.coverPathsFor(req.target.path)
      destAbs = projectService.resolve(art)
      relOrName = art
      url = docCoverUrl(art)
    } else {
      const root = projectService.rootDir
      if (!root) throw new Error('열린 프로젝트가 없습니다')
      const stem = sanitizeAssetName(basename(req.target.path, '.md'))
      // 본문 삽화는 한 문서에 여러 장이 붙는다 → 이름이 겹치지 않게 번호를 붙인다.
      const rel =
        req.target.kind === 'inline'
          ? await uniqueAssetRel(stem)
          : `assets/images/${stem}.png`
      destAbs = projectService.resolve(rel)
      relOrName = rel
      url = '' // 렌더러가 assetUrl(rel)로 만든다
    }

    const engine = await imageService.generate(
      {
        destAbsPath: destAbs,
        ratio: req.ratio,
        prompt: req.prompt,
        style: req.style,
        cover: req.target.kind === 'cover',
        engine: req.engine
      },
      progress,
      ac.signal
    )

    if (req.target.kind === 'cover') {
      await libraryService.noteCoverArt(req.target.bookId)
      url = `${url}?v=${Date.now()}` // 캐시버스트 — 다시 그리면 새 그림이 보여야 한다
    } else if (req.target.kind === 'docCover') {
      url = `${url}?v=${Date.now()}`
    }

    if (!sender.isDestroyed()) {
      sender.send('image:done', { requestId: req.requestId, path: relOrName, url, engine })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const detail = err instanceof AIError ? err.raw : ''
    if (!sender.isDestroyed()) {
      sender.send('image:error', { requestId: req.requestId, message, detail })
    }
  } finally {
    imageJobs.delete(req.requestId)
  }
}

/** 표지 그림을 캔버스로 읽을 수 있는 URL(CORS 허용 스킴 — preload의 docCoverUrl과 같은 규칙). */
function docCoverUrl(rel: string): string {
  return `ice-cover://doc/${rel.split('/').map(encodeURIComponent).join('/')}`
}

/** 자료 파일명 안전화(경로 주입 방지). */
function sanitizeAssetName(name: string): string {
  const base = basename(name).replace(/[\\/:*?"<>|]/g, '_').trim()
  return base || 'image'
}

/** 본문 삽화용 빈 이름 찾기 — `<문서명>-1.png`, `-2`, … 처음 비어 있는 번호. */
async function uniqueAssetRel(stem: string): Promise<string> {
  for (let n = 1; n < 1000; n += 1) {
    const rel = `assets/images/${stem}-${n}.png`
    try {
      await fsp.access(projectService.resolve(rel))
    } catch {
      return rel // 없는 번호 = 쓸 자리
    }
  }
  return `assets/images/${stem}-${Date.now()}.png`
}
