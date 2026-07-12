/**
 * LibraryService — 서재(모든 책을 담는 단일 보관 경로)와 책장(ICEWriter 방식, BLUEPRINT §0.2).
 *
 * 사용자는 폴더를 매번 고르지 않는다. 서재 경로 **하나**를 정해두면(기본 ~/Documents/ICEFiction,
 * 앱 설정 config.json에 기록) 그 안에 책들이 폴더로 쌓인다. "새 소설"은 서재 안에 폴더를 자동
 * 생성한다. 책장은 그 폴더들을 스캔해 카드로 보여준다.
 *
 * 서재를 클라우드 폴더(MYBOX 등)로 바꾸면 여러 컴퓨터가 같은 서재를 공유한다(이식성 §6.11).
 */
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { BookSummary, LibraryInfo, ProjectManifest, ProjectSummary } from '../../shared/types'
import { writeFileAtomic } from '../lib/atomic'
import { projectService } from './project'

const MANIFEST = 'icefiction.json'
const CONFIG = 'config.json'
/** AI가 그린 표지 원본 아트(글자 없음). 제목만 다시 얹을 때 재사용한다(§7.6). */
export const COVER_ART = 'cover-art.png'
/** 표지로 허용하는 이미지 확장자(경로 주입·비이미지 차단). */
const COVER_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])

/** 표지 파일이 있으면 바로 쓸 수 있는 ice-cover:// URL(캐시버스트 mtime 포함)을 만든다. */
function coverUrl(id: string, mtimeMs: number): string {
  return `ice-cover://book/${encodeURIComponent(id)}?v=${Math.floor(mtimeMs)}`
}

interface AppConfig {
  libraryDir?: string
}

/**
 * Electron 경로 지연 로드 — 테스트(node)에서는 env 오버라이드를 써 electron을 건드리지 않는다.
 * ICEFICTION_CONFIG / ICEFICTION_DOCS 로 설정·기본서재 위치를 강제할 수 있다(ICEWriter ICEWRITER_DATA 방식).
 */
async function appPath(name: 'userData' | 'documents'): Promise<string> {
  const { app } = await import('electron')
  return app.getPath(name)
}

export class LibraryService {
  /** 앱 설정 파일 = %APPDATA%/ICEFiction/config.json (Electron userData). */
  private async configPath(): Promise<string> {
    if (process.env.ICEFICTION_CONFIG) return process.env.ICEFICTION_CONFIG
    return join(await appPath('userData'), CONFIG)
  }

  private async readConfig(): Promise<AppConfig> {
    try {
      return JSON.parse(await fs.readFile(await this.configPath(), 'utf8')) as AppConfig
    } catch {
      return {}
    }
  }

  private async writeConfig(cfg: AppConfig): Promise<void> {
    await writeFileAtomic(await this.configPath(), JSON.stringify(cfg, null, 2))
  }

  /** 서재 경로 결정: 설정값 → 기본(~/Documents/ICEFiction). 폴더는 보장 생성. */
  async libraryDir(): Promise<string> {
    const cfg = await this.readConfig()
    const base = process.env.ICEFICTION_DOCS ?? (await appPath('documents'))
    const dir = cfg.libraryDir || join(base, 'ICEFiction')
    await fs.mkdir(dir, { recursive: true })
    return dir
  }

  async setLibraryDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true })
    await this.writeConfig({ ...(await this.readConfig()), libraryDir: dir })
  }

  /** 서재 정보(경로 + 책 목록). */
  async info(): Promise<LibraryInfo> {
    return { dir: await this.libraryDir(), books: await this.scan() }
  }

  /** 서재 안 책 폴더(icefiction.json 보유)를 스캔해 요약 목록으로. 최근 수정순. */
  async scan(): Promise<BookSummary[]> {
    const dir = await this.libraryDir()
    let entries: string[]
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
    } catch {
      return []
    }
    const books: BookSummary[] = []
    for (const name of entries) {
      const summary = await this.readBook(join(dir, name), name)
      if (summary) books.push(summary)
    }
    // 수동 정렬(order) 우선 → 나머지는 최근 수정순으로 뒤에. order가 하나도 없으면 기존과 동일(최근순).
    books.sort((a, b) => {
      const ao = a.order ?? Number.POSITIVE_INFINITY
      const bo = b.order ?? Number.POSITIVE_INFINITY
      if (ao !== bo) return ao - bo
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    return books
  }

  private async readBook(folder: string, id: string): Promise<BookSummary | null> {
    try {
      const manifest = JSON.parse(
        await fs.readFile(join(folder, MANIFEST), 'utf8')
      ) as ProjectManifest
      const st = await fs.stat(folder)
      return {
        id,
        title: manifest.title || id,
        updatedAt: st.mtime.toISOString(),
        chapterCount: await this.countChapters(join(folder, 'manuscript')),
        cover: await this.coverUrlFor(folder, id, manifest),
        order: typeof manifest.order === 'number' ? manifest.order : undefined
      }
    } catch {
      return null // icefiction.json 없는 폴더는 책이 아님 → 무시
    }
  }

  /** 매니페스트 cover가 가리키는 파일이 실제로 있으면 ice-cover URL(캐시버스트)로, 없으면 undefined. */
  private async coverUrlFor(
    folder: string,
    id: string,
    manifest: ProjectManifest
  ): Promise<string | undefined> {
    const name = manifest.cover
    if (!name || basename(name) !== name || !COVER_EXT.has(extname(name).toLowerCase())) {
      return undefined
    }
    try {
      const st = await fs.stat(join(folder, name))
      return coverUrl(id, st.mtimeMs)
    } catch {
      return undefined // cover 필드는 있으나 파일이 삭제된 경우
    }
  }

  private async countChapters(manuscriptDir: string): Promise<number> {
    let count = 0
    async function walk(dir: string): Promise<void> {
      let items
      try {
        items = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const it of items) {
        if (it.isDirectory()) await walk(join(dir, it.name))
        else if (it.name.toLowerCase().endsWith('.md')) count += 1
      }
    }
    await walk(manuscriptDir)
    return count
  }

  /** 새 책 = 서재 안에 제목 기반 폴더 자동 생성 + 표준 구조. 생성 후 바로 연다. */
  async createBook(title: string): Promise<ProjectSummary> {
    const dir = await this.libraryDir()
    const folder = await this.uniqueFolder(dir, sanitize(title) || '무제')
    return projectService.create(folder, title)
  }

  async openBook(id: string): Promise<ProjectSummary> {
    const dir = await this.libraryDir()
    return projectService.open(join(dir, safeName(id)))
  }

  /** 책 폴더 이름 변경(+매니페스트 title 갱신). */
  async renameBook(id: string, newTitle: string): Promise<LibraryInfo> {
    const dir = await this.libraryDir()
    const from = join(dir, safeName(id))
    const to = await this.uniqueFolder(dir, sanitize(newTitle) || '무제')
    await fs.rename(from, to)
    // 매니페스트 title도 함께 갱신.
    try {
      const mfPath = join(to, MANIFEST)
      const mf = JSON.parse(await fs.readFile(mfPath, 'utf8')) as ProjectManifest
      mf.title = newTitle
      await writeFileAtomic(mfPath, JSON.stringify(mf, null, 2))
    } catch {
      /* 매니페스트 없으면 폴더명만 바뀜 */
    }
    return this.info()
  }

  /** 표지 지정/변경 — 선택한 이미지(srcAbsPath)를 책 폴더에 cover.<ext>로 복사하고 매니페스트에 기록. */
  async setBookCover(id: string, srcAbsPath: string): Promise<LibraryInfo> {
    const ext = extname(srcAbsPath).toLowerCase()
    if (!COVER_EXT.has(ext)) throw new Error(`표지로 쓸 수 없는 형식입니다: ${ext || '알 수 없음'}`)
    const dir = await this.libraryDir()
    const folder = join(dir, safeName(id))
    await this.removeCoverFiles(folder) // 이전 표지(확장자 다를 수 있음) 정리
    const filename = `cover${ext}`
    await fs.copyFile(srcAbsPath, join(folder, filename))
    await this.patchManifest(folder, (m) => ({ ...m, cover: filename }))
    return this.info()
  }

  /** 표지를 이미지 데이터(base64 PNG)로 저장 — 앱이 제목을 얹어 합성한 표지를 받는다(§7.6). */
  async setBookCoverData(id: string, base64Png: string): Promise<LibraryInfo> {
    const dir = await this.libraryDir()
    const folder = join(dir, safeName(id))
    const data = Buffer.from(base64Png.replace(/^data:image\/png;base64,/, ''), 'base64')
    if (data.length < 100) throw new Error('표지 이미지 데이터가 비어 있습니다')
    await this.removeCoverFiles(folder)
    await fs.writeFile(join(folder, 'cover.png'), data)
    await this.patchManifest(folder, (m) => ({ ...m, cover: 'cover.png' }))
    return this.info()
  }

  /** 표지 제거 — cover.* 파일 삭제 + 매니페스트 cover 해제(원본 아트 cover-art.png는 남긴다). */
  async removeBookCover(id: string): Promise<LibraryInfo> {
    const dir = await this.libraryDir()
    const folder = join(dir, safeName(id))
    await this.removeCoverFiles(folder)
    await this.patchManifest(folder, ({ cover: _drop, ...rest }) => rest)
    return this.info()
  }

  /** 책 폴더 절대경로(표지 아트 생성 위치). */
  async bookFolder(id: string): Promise<string> {
    return join(await this.libraryDir(), safeName(id))
  }

  /** 표지 생성 모달이 쓰는 책 정보 — 제목·스타일 바이블·이미 그려둔 아트. */
  async bookMeta(id: string): Promise<{ title: string; imageStyle?: string; coverArtUrl?: string }> {
    const folder = await this.bookFolder(id)
    const manifest = JSON.parse(
      await fs.readFile(join(folder, MANIFEST), 'utf8')
    ) as ProjectManifest
    let coverArtUrl: string | undefined
    try {
      const st = await fs.stat(join(folder, COVER_ART))
      coverArtUrl = `ice-cover://art/${encodeURIComponent(id)}?v=${Math.floor(st.mtimeMs)}`
    } catch {
      /* 아직 아트 없음 */
    }
    return { title: manifest.title || id, imageStyle: manifest.imageStyle, coverArtUrl }
  }

  /** 이 책의 이미지 스타일 바이블 저장(모든 그림의 화풍을 맞춘다). */
  async setBookImageStyle(id: string, style: string): Promise<void> {
    const folder = await this.bookFolder(id)
    await this.patchManifest(folder, (m) => ({ ...m, imageStyle: style || undefined }))
  }

  /** AI가 그린 표지 아트(글자 없음)를 매니페스트에 기록. */
  async noteCoverArt(id: string): Promise<void> {
    const folder = await this.bookFolder(id)
    await this.patchManifest(folder, (m) => ({ ...m, coverArt: COVER_ART }))
  }

  /** 표지 아트 파일의 절대경로(ice-cover://art 핸들러용). 없으면 null. */
  async coverArtAbsPath(id: string): Promise<string | null> {
    try {
      const abs = join(await this.bookFolder(id), COVER_ART)
      await fs.access(abs)
      return abs
    } catch {
      return null
    }
  }

  /** 책장 수동 정렬 — 넘겨준 id 순서대로 각 책 매니페스트 order를 0,1,2…로 다시 매긴다. */
  async reorderBooks(orderedIds: string[]): Promise<LibraryInfo> {
    const dir = await this.libraryDir()
    for (let i = 0; i < orderedIds.length; i += 1) {
      const folder = join(dir, safeName(orderedIds[i]))
      const order = i
      try {
        await this.patchManifest(folder, (m) => ({ ...m, order }))
      } catch {
        /* 개별 책 갱신 실패는 건너뛴다(견고성) */
      }
    }
    return this.info()
  }

  /** 표지 파일의 절대경로(ice-cover 프로토콜 핸들러용). 없으면 null. */
  async coverAbsPath(id: string): Promise<string | null> {
    try {
      const dir = await this.libraryDir()
      const folder = join(dir, safeName(id))
      const manifest = JSON.parse(await fs.readFile(join(folder, MANIFEST), 'utf8')) as ProjectManifest
      const name = manifest.cover
      if (!name || basename(name) !== name || !COVER_EXT.has(extname(name).toLowerCase())) return null
      const abs = join(folder, name)
      await fs.access(abs)
      return abs
    } catch {
      return null
    }
  }

  /** 책 폴더 안 cover.* 이미지들을 모두 지운다(표지 교체·제거 시). */
  private async removeCoverFiles(folder: string): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.readdir(folder)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.toLowerCase().startsWith('cover.') && COVER_EXT.has(extname(name).toLowerCase())) {
        await fs.rm(join(folder, name), { force: true })
      }
    }
  }

  /**
   * 책 매니페스트를 읽어 변환 함수를 적용하고 원자적으로 되쓴다.
   *
   * **책 폴더별로 직렬화한다.** 이미지 생성 시작 시 "스타일 저장"과 "표지 아트 기록"이 동시에
   * 같은 매니페스트를 rename하려다 Windows에서 EPERM으로 터졌다(실측). 읽기-수정-쓰기 경합이라
   * 조용한 데이터 유실도 난다. 큐로 묶어 한 번에 하나만 쓰게 한다.
   */
  private manifestQueue = new Map<string, Promise<void>>()

  private async patchManifest(
    folder: string,
    fn: (m: ProjectManifest) => ProjectManifest
  ): Promise<void> {
    const prev = this.manifestQueue.get(folder) ?? Promise.resolve()
    const next = prev
      .catch(() => {}) // 앞 작업이 실패해도 큐는 계속 흐른다
      .then(async () => {
        const path = join(folder, MANIFEST)
        const manifest = JSON.parse(await fs.readFile(path, 'utf8')) as ProjectManifest
        await writeFileAtomic(path, JSON.stringify(fn(manifest), null, 2))
      })
    this.manifestQueue.set(folder, next)
    try {
      await next
    } finally {
      if (this.manifestQueue.get(folder) === next) this.manifestQueue.delete(folder)
    }
  }

  /** 책 삭제 = 서재 안 .trash로 이동(즉시 rmtree 대신 복구 여지, §6.8). */
  async deleteBook(id: string): Promise<LibraryInfo> {
    const dir = await this.libraryDir()
    const from = join(dir, safeName(id))
    const trash = join(dir, '.trash')
    await fs.mkdir(trash, { recursive: true })
    const to = await this.uniqueFolder(trash, `${basename(from)}`)
    await fs.rename(from, to)
    return this.info()
  }

  private async uniqueFolder(parent: string, name: string): Promise<string> {
    let candidate = join(parent, name)
    let n = 2
    for (;;) {
      try {
        await fs.access(candidate)
        candidate = join(parent, `${name} (${n})`)
        n += 1
      } catch {
        return candidate
      }
    }
  }
}

/** 폴더명 금지문자 제거(경로 주입 방지). */
function sanitize(name: string): string {
  return (name || '').replace(/[\\/:*?"<>|.[\]]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** id(폴더명)에 경로 구분자·상위 참조가 섞이지 않게 basename만 취한다. */
function safeName(id: string): string {
  const base = basename(id)
  if (!base || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new Error(`잘못된 책 id: ${id}`)
  }
  return base
}

export const libraryService = new LibraryService()
