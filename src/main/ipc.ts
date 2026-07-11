/**
 * IPC 핸들러 — 렌더러의 window.api 호출을 main 서비스로 잇는다.
 *
 * 렌더러는 파일시스템에 직접 접근하지 않는다(contextIsolation). 모든 IO는 여기를 거친다 —
 * 보안 + Mac 이식성(BLUEPRINT §5). 서재/책장은 LibraryService, 열린 책은 ProjectService.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AIConfig, ChatMessage, DocType, SaveDocRequest } from '../shared/types'
import { aiService } from './services/ai'
import { libraryService } from './services/library'
import { projectService } from './services/project'

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

  ipcMain.handle('library:reveal', async () => {
    await shell.openPath(await libraryService.libraryDir())
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
    async (_e, currentPath: string | null, currentBody: string, includeAssets?: boolean) =>
      projectService.buildAiContext(currentPath, currentBody, includeAssets)
  )
  ipcMain.handle('ai:attachmentInfo', async (_e, relPath: string) =>
    projectService.attachmentInfo(relPath)
  )
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
}
