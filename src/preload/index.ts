/**
 * Preload — contextBridge로 window.api를 노출한다. 렌더러는 이 표면으로만 main과 통신한다.
 *
 * webUtils.getPathForFile: 최신 Electron은 File.path를 없앴다. 드래그드롭한 파일의 실제 경로는
 * 이 API로만 얻을 수 있다(자료 반입 §6.10).
 */
import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'
import type {
  AIConfig,
  AIDelta,
  AIDone,
  AIErrorEvent,
  AssetItem,
  ChatMessage,
  DocContent,
  DocType,
  IngestResult,
  LibraryInfo,
  ProjectSummary,
  SaveDocRequest,
  TreeNode
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  // ── 서재(책장) ──
  getLibrary: (): Promise<LibraryInfo> => ipcRenderer.invoke('library:get'),
  chooseLibraryDir: (): Promise<LibraryInfo | null> => ipcRenderer.invoke('library:choose'),
  createBook: (title: string): Promise<ProjectSummary> =>
    ipcRenderer.invoke('library:createBook', title),
  openBook: (id: string): Promise<ProjectSummary> => ipcRenderer.invoke('library:openBook', id),
  renameBook: (id: string, newTitle: string): Promise<LibraryInfo> =>
    ipcRenderer.invoke('library:renameBook', id, newTitle),
  deleteBook: (id: string): Promise<LibraryInfo> => ipcRenderer.invoke('library:deleteBook', id),
  setBookCover: (id: string): Promise<LibraryInfo> => ipcRenderer.invoke('library:setCover', id),
  removeBookCover: (id: string): Promise<LibraryInfo> =>
    ipcRenderer.invoke('library:removeCover', id),
  reorderBooks: (orderedIds: string[]): Promise<LibraryInfo> =>
    ipcRenderer.invoke('library:reorder', orderedIds),
  revealLibrary: (): Promise<void> => ipcRenderer.invoke('library:reveal'),
  // ── 열린 책 ──
  refreshTree: (): Promise<TreeNode[]> => ipcRenderer.invoke('project:refreshTree'),
  readDoc: (path: string): Promise<DocContent> => ipcRenderer.invoke('doc:read', path),
  saveDoc: (req: SaveDocRequest): Promise<void> => ipcRenderer.invoke('doc:save', req),
  createDoc: (dir: string, type: DocType, title: string): Promise<TreeNode[]> =>
    ipcRenderer.invoke('doc:create', dir, type, title),
  createFolder: (dir: string, name: string): Promise<TreeNode[]> =>
    ipcRenderer.invoke('doc:createFolder', dir, name),
  trashEntry: (path: string): Promise<TreeNode[]> => ipcRenderer.invoke('doc:trash', path),
  renameEntry: (path: string, newName: string): Promise<TreeNode[]> =>
    ipcRenderer.invoke('doc:rename', path, newName),
  revealInOs: (path: string): Promise<void> => ipcRenderer.invoke('os:reveal', path),
  openProjectFolder: (): Promise<void> => ipcRenderer.invoke('os:openProjectFolder'),
  ingestFiles: (absPaths: string[], targetDir?: string): Promise<IngestResult> =>
    ipcRenderer.invoke('assets:ingest', absPaths, targetDir),
  importAssets: (): Promise<string[]> => ipcRenderer.invoke('assets:import'),
  listAssets: (): Promise<AssetItem[]> => ipcRenderer.invoke('assets:list'),
  openPdf: (relPath: string): Promise<void> => ipcRenderer.invoke('pdf:open', relPath),
  convertLegacyEmbeds: (): Promise<{ files: number; embeds: number }> =>
    ipcRenderer.invoke('md:convertEmbeds'),
  /** 상대 POSIX 경로 → ice-asset:// URL (IPC 불필요, 동기). */
  assetUrl: (relPath: string): string =>
    `ice-asset://asset/${relPath.split('/').map(encodeURIComponent).join('/')}`,
  /** 드래그드롭한 File의 실제 절대경로(webUtils). */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  /** UI 확대/축소 — 프레임 줌이라 본문(에디터)까지 함께 커진다. 반환=적용된 배율. */
  zoomBy: (delta: number): number => {
    const z = Math.min(2.5, Math.max(0.6, Math.round((webFrame.getZoomFactor() + delta) * 100) / 100))
    webFrame.setZoomFactor(z)
    return z
  },
  zoomReset: (): number => {
    webFrame.setZoomFactor(1)
    return 1
  },

  // ── AI ──
  buildAiContext: (
    currentPath: string | null,
    currentBody: string,
    includeAssets?: boolean
  ): Promise<import('../shared/types').AIContext> =>
    ipcRenderer.invoke('ai:buildContext', currentPath, currentBody, includeAssets),
  aiAttachmentInfo: (relPath: string): Promise<import('../shared/types').AIAttachmentInfo> =>
    ipcRenderer.invoke('ai:attachmentInfo', relPath),
  listAiModels: (
    draft: Pick<AIConfig, 'kind' | 'baseUrl' | 'cliCommand'>,
    apiKey?: string
  ): Promise<string[]> => ipcRenderer.invoke('ai:listModels', draft, apiKey),
  getAiConfig: (): Promise<AIConfig> => ipcRenderer.invoke('ai:getConfig'),
  setAiConfig: (cfg: AIConfig, apiKey?: string): Promise<AIConfig> =>
    ipcRenderer.invoke('ai:setConfig', cfg, apiKey),
  checkAi: (): Promise<import('../shared/types').AIConnStatus> => ipcRenderer.invoke('ai:check'),
  aiGenerate: (requestId: string, messages: ChatMessage[]): Promise<void> =>
    ipcRenderer.invoke('ai:generate', requestId, messages),
  aiCancel: (requestId: string): void => ipcRenderer.send('ai:cancel', requestId),
  onAiDelta: (cb: (d: AIDelta) => void): (() => void) => subscribe('ai:delta', cb),
  onAiDone: (cb: (d: AIDone) => void): (() => void) => subscribe('ai:done', cb),
  onAiError: (cb: (d: AIErrorEvent) => void): (() => void) => subscribe('ai:error', cb)
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
