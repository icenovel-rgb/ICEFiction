/**
 * 렌더러 상태 허브(zustand) — 서재/책장, 열린 책, 미저장·자동 저장(BLUEPRINT §6.1).
 *
 * 화면 라우팅: project === null 이면 책장(서재), 열린 책이 있으면 워크스페이스(에디터).
 * 자동 저장은 변경 2초 뒤 디바운스. 문서 전환·책 닫기·앱 종료 직전 즉시 flush해 유실을 막는다.
 */
import { create } from 'zustand'
import type {
  AssetItem,
  BookSummary,
  DocContent,
  DocType,
  Frontmatter,
  LibraryInfo,
  ProjectSummary,
  TreeNode
} from '../../../shared/types'
import { useSession } from './session'

const AUTOSAVE_MS = 2000

interface State {
  library: LibraryInfo | null
  loadingLibrary: boolean
  project: ProjectSummary | null
  tree: TreeNode[]
  assets: AssetItem[]
  activePath: string | null
  /** 섹션 갤러리로 펼쳐 보는 폴더 경로(예: 'characters'). null이면 에디터를 본다(§6.2). */
  galleryPath: string | null
  /**
   * 전체 검색 → 에디터 점프 예약(본문 기준 오프셋). 문서 내용이 store에 실린 **뒤에만** 세팅해야
   * 한다 — 먼저 세우면 Editor가 옛 문서에 선택을 찍는다(계획 리스크 '점프 타이밍'). Editor가
   * 본문 교체 effect **다음에 선언된** effect에서 소비하고 null로 되돌린다.
   */
  pendingJump: { from: number; to: number; scrollTop?: number } | null
  frontmatter: Frontmatter
  body: string
  dirty: boolean
  saving: boolean
  sessionStartChars: number

  loadLibrary: () => Promise<void>
  chooseLibraryDir: () => Promise<void>
  revealLibrary: () => void
  createBook: (title: string) => Promise<void>
  openBook: (id: string) => Promise<void>
  renameBook: (id: string, title: string) => Promise<void>
  deleteBook: (id: string) => Promise<void>
  setBookCover: (id: string) => Promise<void>
  removeBookCover: (id: string) => Promise<void>
  reorderBooks: (orderedIds: string[]) => Promise<void>
  closeBook: () => Promise<void>

  selectDoc: (path: string) => Promise<void>
  /** 검색 결과로 이동 — 문서를 열고(이미 열려 있으면 그대로) 해당 위치를 선택·스크롤. */
  jumpTo: (path: string, from: number, to: number) => Promise<void>
  /** Editor가 점프를 소비한 뒤 호출. */
  clearJump: () => void
  openGallery: (path: string) => void
  closeGallery: () => void
  setBody: (body: string) => void
  setFrontmatter: (patch: Partial<Frontmatter>) => void
  saveNow: () => Promise<void>
  refreshTree: () => Promise<void>
  createDoc: (dir: string, type: DocType, title: string) => Promise<void>
  createFolder: (dir: string, name: string) => Promise<void>
  trashEntry: (path: string) => Promise<void>
  renameEntry: (path: string, newName: string) => Promise<void>
  ingest: (absPaths: string[], targetDir?: string) => Promise<void>
  loadAssets: () => Promise<void>
  importAssets: () => Promise<string[]>
  attachImage: (path: string) => void
  detachImage: (path: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

const CLEARED = {
  project: null,
  tree: [],
  assets: [],
  activePath: null,
  galleryPath: null,
  pendingJump: null,
  body: '',
  frontmatter: {},
  dirty: false
}

export const useStore = create<State>((set, get) => {
  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void get().saveNow(), AUTOSAVE_MS)
  }

  function enterBook(summary: ProjectSummary): void {
    set({
      project: summary,
      tree: summary.tree,
      assets: [],
      activePath: null,
      galleryPath: 'manuscript', // 책을 열면 원고 갤러리부터 — 빈 에디터 대신 챕터가 한눈에
      pendingJump: null,
      body: '',
      frontmatter: {},
      dirty: false
    })
    void get().loadAssets()
    void restoreSpot(summary)
  }

  /**
   * 마지막에 쓰던 문서·커서로 돌아간다(§6.1). 기억이 없거나 그 문서가 사라졌으면 조용히
   * 원고 갤러리에 머문다 — 복원 실패가 책 열기를 막아서는 안 된다.
   */
  async function restoreSpot(summary: ProjectSummary): Promise<void> {
    const spot = useSession.getState().recall(summary.absolutePath)
    if (!spot) return
    try {
      await get().selectDoc(spot.path)
    } catch {
      useSession.getState().forget(summary.absolutePath) // 지워진 문서는 기억에서도 지운다
      set({ galleryPath: 'manuscript' })
      return
    }
    // 본문이 store에 실린 **뒤에만** 위치를 예약한다 — 순서가 정확성의 전부다(검색 점프와 같은 규칙).
    set({ pendingJump: { from: spot.anchor, to: spot.head, scrollTop: spot.scrollTop } })
  }

  return {
    library: null,
    loadingLibrary: true,
    project: null,
    tree: [],
    assets: [],
    activePath: null,
    galleryPath: null,
    pendingJump: null,
    frontmatter: {},
    body: '',
    dirty: false,
    saving: false,
    sessionStartChars: 0,

    async loadLibrary() {
      set({ loadingLibrary: true })
      const library = await window.api.getLibrary()
      set({ library, loadingLibrary: false })
    },

    async chooseLibraryDir() {
      const library = await window.api.chooseLibraryDir()
      if (library) set({ library })
    },

    revealLibrary() {
      void window.api.revealLibrary()
    },

    async createBook(title) {
      const summary = await window.api.createBook(title)
      enterBook(summary)
    },

    async openBook(id) {
      const summary = await window.api.openBook(id)
      enterBook(summary)
    },

    async renameBook(id, title) {
      const library = await window.api.renameBook(id, title)
      set({ library })
    },

    async deleteBook(id) {
      const library = await window.api.deleteBook(id)
      set({ library })
    },

    async setBookCover(id) {
      const library = await window.api.setBookCover(id)
      set({ library })
    },

    async removeBookCover(id) {
      const library = await window.api.removeBookCover(id)
      set({ library })
    },

    async reorderBooks(orderedIds) {
      // 드래그 결과를 즉시 반영(낙관적)한 뒤, 서버 정렬 결과로 확정한다.
      const cur = get().library
      if (cur) {
        const byId = new Map(cur.books.map((b) => [b.id, b]))
        const reordered = orderedIds
          .map((id) => byId.get(id))
          .filter((b): b is BookSummary => !!b)
        set({ library: { ...cur, books: reordered } })
      }
      const library = await window.api.reorderBooks(orderedIds)
      set({ library })
    },

    async closeBook() {
      if (get().dirty) await get().saveNow()
      set(CLEARED)
      await get().loadLibrary() // 책장 목록 갱신(수정시각·챕터수)
    },

    async selectDoc(path) {
      if (get().dirty) await get().saveNow()
      const doc: DocContent = await window.api.readDoc(path)
      set({
        activePath: doc.path,
        galleryPath: null, // 문서를 고르면 갤러리는 닫고 에디터로
        frontmatter: doc.frontmatter,
        body: doc.body,
        dirty: false,
        sessionStartChars: Array.from(doc.body).length
      })
    },

    async jumpTo(path, from, to) {
      // 다른 문서면 먼저 열어 본문을 store에 싣는다. 같은 문서면 갤러리만 닫는다.
      if (get().activePath !== path) await get().selectDoc(path)
      else set({ galleryPath: null })
      set({ pendingJump: { from, to } }) // 반드시 본문이 실린 뒤 — 순서가 정확성의 전부다
    },

    clearJump() {
      set({ pendingJump: null })
    },

    openGallery(path) {
      set({ galleryPath: path })
    },

    closeGallery() {
      set({ galleryPath: null })
    },

    setBody(body) {
      set({ body, dirty: true })
      scheduleSave()
    },

    setFrontmatter(patch) {
      set((s) => ({ frontmatter: { ...s.frontmatter, ...patch }, dirty: true }))
      scheduleSave()
    },

    async saveNow() {
      const { activePath, frontmatter, body, saving } = get()
      if (!activePath || saving) return
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      set({ saving: true })
      try {
        await window.api.saveDoc({ path: activePath, frontmatter, body })
        set({ dirty: false })
        await get().refreshTree()
      } finally {
        set({ saving: false })
      }
    },

    async refreshTree() {
      set({ tree: await window.api.refreshTree() })
    },

    async createDoc(dir, type, title) {
      set({ tree: await window.api.createDoc(dir, type, title) })
    },

    async createFolder(dir, name) {
      set({ tree: await window.api.createFolder(dir, name) })
    },

    async trashEntry(path) {
      if (get().dirty) await get().saveNow()
      const active = get().activePath
      const tree = await window.api.trashEntry(path)
      const affected = !!active && (active === path || active.startsWith(path + '/'))
      set(affected ? { tree, activePath: null, body: '', frontmatter: {}, dirty: false } : { tree })
      await get().loadAssets()
    },

    async renameEntry(path, newName) {
      if (get().dirty) await get().saveNow()
      const active = get().activePath
      const tree = await window.api.renameEntry(path, newName)
      const affected = !!active && (active === path || active.startsWith(path + '/'))
      set(affected ? { tree, activePath: null, body: '', frontmatter: {}, dirty: false } : { tree })
    },

    async ingest(absPaths, targetDir) {
      await window.api.ingestFiles(absPaths, targetDir)
      await get().refreshTree()
      await get().loadAssets()
    },

    async loadAssets() {
      set({ assets: await window.api.listAssets() })
    },

    async importAssets() {
      const imported = await window.api.importAssets()
      if (imported.length > 0) {
        await get().refreshTree()
        await get().loadAssets()
      }
      return imported
    },

    attachImage(path) {
      const cur = get().frontmatter.images ?? []
      if (cur.includes(path)) return
      get().setFrontmatter({ images: [...cur, path] })
    },

    detachImage(path) {
      const cur = get().frontmatter.images ?? []
      get().setFrontmatter({ images: cur.filter((p) => p !== path) })
    }
  }
})

// 앱 종료·새로고침 직전 미저장분 flush.
window.addEventListener('beforeunload', () => {
  const s = useStore.getState()
  if (s.dirty && s.activePath) {
    void window.api.saveDoc({ path: s.activePath, frontmatter: s.frontmatter, body: s.body })
  }
})
