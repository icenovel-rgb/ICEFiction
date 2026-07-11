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
import { basename, join } from 'node:path'
import type { BookSummary, LibraryInfo, ProjectManifest, ProjectSummary } from '../../shared/types'
import { writeFileAtomic } from '../lib/atomic'
import { projectService } from './project'

const MANIFEST = 'icefiction.json'
const CONFIG = 'config.json'

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
    books.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
        chapterCount: await this.countChapters(join(folder, 'manuscript'))
      }
    } catch {
      return null // icefiction.json 없는 폴더는 책이 아님 → 무시
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
