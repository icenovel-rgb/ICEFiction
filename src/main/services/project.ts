/**
 * ProjectService — "마크다운 폴더 = 프로젝트"의 파일 계층(BLUEPRINT §4).
 *
 * 한 번에 프로젝트 하나만 연다. 진실의 원천은 폴더의 .md 파일이며, 이 서비스는 그것을 스캔·파싱·
 * 원자적 저장한다. 렌더러에는 항상 **프로젝트 루트 기준 상대·POSIX 경로**만 넘긴다(이식성 — §6.11).
 */
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join, posix, relative, sep } from 'node:path'
import type {
  AIAttachment,
  AIAttachmentInfo,
  DocContent,
  DocType,
  IngestResult,
  ProjectManifest,
  ProjectSummary,
  SaveDocRequest,
  SearchAllOptions,
  SearchAllResult,
  SearchFileResult,
  SearchMatch,
  TreeNode
} from '../../shared/types'
import { writeFileAtomic } from '../lib/atomic'
import { parseDoc, stringifyDoc } from '../lib/frontmatter'
import { OPEN_MAX_FILES } from '../../shared/openRequest'
import { encodeEmbedUrl, posixDir, relPosix } from '../../shared/mdEmbed'

const SCHEMA_VERSION = 1
const MANIFEST = 'icefiction.json'

/** 바인더에 노출하는 최상위 섹션과 그 안 문서의 기본 타입.
 *  세계관 하위 카테고리(장소·세력 등)는 기본 제공하지 않는다 — 사용자가 폴더로 자유 구성한다. */
const SECTIONS: { dir: string; type: DocType }[] = [
  { dir: 'manuscript', type: 'chapter' },
  { dir: 'characters', type: 'character' },
  { dir: 'world', type: 'world' },
  { dir: 'notes', type: 'note' },
  { dir: 'style', type: 'style' } // 문체 방 — AI가 항상 이 문체로 쓰게 하는 하네스(§7.2a)
]

/** 문서 표지(챕터 표지 §7.6) — 완성본은 여기에, 글자 없는 원본 아트는 그 아래 숨김 폴더에. */
const COVER_DIR = 'assets/covers'
const COVER_ART_DIR = '.art'

/** 문체 방 — 지침은 style/ 직속 .md, 참고 원고는 style/samples/ 아래. */
const STYLE_DIR = 'style'
const STYLE_SAMPLES = 'samples'
/** 문체 하네스 예산(글자) — 지침은 통째로, 샘플은 발췌로. */
const STYLE_GUIDE_CAP = 4000
const STYLE_SAMPLE_EACH = 1200
const STYLE_SAMPLE_BUDGET = 4000

/** 자료 문서 자동 읽기 예산(글자) — 목차는 전부 알리되, 본문은 여기까지만 자동으로 싣는다. */
const ASSET_READ_BUDGET = 8000
/** 전체 목차에 나열할 최대 줄 수 — 이 이상은 "…외 N개"로 접는다. */
const INDEX_MAX = 300

/** 열람 프로토콜 상한(§7.5) — 파일 수는 shared(파서와 공용), 글자수는 여기서. */
const OPEN_PER_FILE = 20_000
const OPEN_TOTAL = 60_000

/** 전체 검색 상한 — 흔한 글자(예: "다") 검색이 결과 수천 건으로 UI를 짓누르는 것을 막는다. */
const SEARCH_MAX_PER_FILE = 50
const SEARCH_MAX_TOTAL = 500

/** 자료 확장자 → assets 하위 폴더(§6.10). */
const ASSET_BUCKET: Record<string, string> = {
  '.png': 'images',
  '.jpg': 'images',
  '.jpeg': 'images',
  '.gif': 'images',
  '.webp': 'images',
  '.svg': 'images',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.mkv': 'video',
  '.mp3': 'refs',
  '.wav': 'refs',
  '.pdf': 'refs'
}

/** 상대 POSIX 경로 → 절대경로. `..` 탈출을 막아 프로젝트 밖 쓰기를 차단한다. */
function toAbs(root: string, relPath: string): string {
  const norm = posix.normalize(relPath.replace(/\\/g, '/')).replace(/^\/+/, '')
  if (norm === '..' || norm.startsWith('../')) {
    throw new Error(`프로젝트 밖 경로 접근 차단: ${relPath}`)
  }
  return join(root, norm)
}

/** 절대경로 → 프로젝트 루트 기준 상대 POSIX 경로. */
function toRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/')
}

export class ProjectService {
  private root: string | null = null
  /** PDF 텍스트 추출 캐시(경로+수정시각 기준) — 매 요청·조사마다 재파싱하지 않게. */
  private pdfCache = new Map<string, { mtime: number; text: string }>()

  get rootDir(): string | null {
    return this.root
  }

  /** 새 프로젝트 폴더를 표준 구조로 초기화하고 연다. */
  async create(dir: string, title: string): Promise<ProjectSummary> {
    for (const d of [
      'manuscript',
      'characters',
      'world', // 카테고리 없이 빈 폴더 — 사용자가 직접 카테고리(폴더)를 만든다
      'notes',
      `${STYLE_DIR}/${STYLE_SAMPLES}`, // 문체 방 — 지침은 style/, 참고 원고는 style/samples/
      'assets/images',
      'assets/video',
      'assets/refs',
      'trash',
      'snapshots'
    ]) {
      await fs.mkdir(join(dir, d), { recursive: true })
    }
    const manifest: ProjectManifest = {
      schemaVersion: SCHEMA_VERSION,
      title,
      createdAt: new Date().toISOString(),
      sections: SECTIONS.map((s) => s.dir)
    }
    await writeFileAtomic(join(dir, MANIFEST), JSON.stringify(manifest, null, 2))
    // 첫 챕터 씨앗 — 빈 화면 대신 바로 쓸 거리를 준다.
    // 여기가 `/` 명령을 처음 만나는 자리다(빈 문서 안내는 씨앗 때문에 안 보인다) → 한 줄로 알려 준다.
    await writeFileAtomic(
      join(dir, 'manuscript', '01-첫-장.md'),
      stringifyDoc(
        { type: 'chapter', title: '첫 장', status: 'draft', order: 1 },
        '여기서부터 시작하세요.\n\n' +
          '「/」를 치면 AI 명령(이어쓰기·다듬기·묘사·대사·줄거리·삽화)이 뜹니다. ' +
          'AI 제안은 흐린 글씨로 먼저 보이고, Tab을 눌러야 원고에 들어갑니다(Esc는 취소). ' +
          '이 안내 문단은 지우고 쓰세요.\n'
      )
    )
    await ensureStyleRoom(dir)
    this.root = dir
    return this.summary()
  }

  /** 기존 프로젝트 폴더를 연다. 매니페스트가 없으면 폴더를 감싸 새로 만든다(관대). */
  async open(dir: string): Promise<ProjectSummary> {
    const manifestPath = join(dir, MANIFEST)
    try {
      await fs.access(manifestPath)
    } catch {
      // 매니페스트 없는 폴더도 열 수 있게 최소 구조를 생성(기존 원고 폴더 반입 대비).
      const manifest: ProjectManifest = {
        schemaVersion: SCHEMA_VERSION,
        title: basename(dir),
        createdAt: new Date().toISOString(),
        sections: SECTIONS.map((s) => s.dir)
      }
      await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2))
      for (const s of SECTIONS) await fs.mkdir(join(dir, s.dir), { recursive: true })
    }
    // 문체 방은 나중에 추가된 섹션이라 옛 책에는 없다 — 열 때마다 보강한다(있으면 그대로 둔다).
    await ensureStyleRoom(dir)
    this.root = dir
    return this.summary()
  }

  private async readManifest(): Promise<ProjectManifest> {
    const root = this.requireRoot()
    const raw = await fs.readFile(join(root, MANIFEST), 'utf8')
    return JSON.parse(raw) as ProjectManifest
  }

  private requireRoot(): string {
    if (!this.root) throw new Error('열린 프로젝트가 없습니다')
    return this.root
  }

  async summary(): Promise<ProjectSummary> {
    const root = this.requireRoot()
    return {
      manifest: await this.readManifest(),
      absolutePath: root,
      tree: await this.buildTree()
    }
  }

  /** 바인더 트리 = 섹션별 재귀 스캔. trash/snapshots/assets/.ice·숨김파일 제외. */
  async buildTree(): Promise<TreeNode[]> {
    const root = this.requireRoot()
    const out: TreeNode[] = []
    for (const section of SECTIONS) {
      const abs = join(root, section.dir)
      let exists = true
      try {
        await fs.access(abs)
      } catch {
        exists = false
      }
      out.push({
        path: section.dir,
        name: section.dir,
        isDir: true,
        type: 'folder',
        children: exists ? await this.scanDir(abs, section.type) : []
      })
    }
    return out
  }

  private async scanDir(abs: string, defaultType: DocType): Promise<TreeNode[]> {
    const root = this.requireRoot()
    const entries = await fs.readdir(abs, { withFileTypes: true })
    const nodes: TreeNode[] = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue // .thumbs 등 숨김 제외
      const childAbs = join(abs, e.name)
      const relPath = toRel(root, childAbs)
      if (e.isDirectory()) {
        // 하위 폴더 = 사용자 카테고리(원고에선 부/Part). 안의 문서는 섹션 기본 타입을 이어받는다.
        nodes.push({
          path: relPath,
          name: e.name,
          isDir: true,
          type: defaultType === 'chapter' ? 'part' : 'folder',
          children: await this.scanDir(childAbs, defaultType)
        })
      } else if (extname(e.name).toLowerCase() === '.md') {
        nodes.push(await this.fileNode(childAbs, relPath, defaultType))
      }
    }
    nodes.sort(sortNodes)
    return nodes
  }

  private async fileNode(abs: string, relPath: string, fallback: DocType): Promise<TreeNode> {
    let title = basename(relPath, '.md')
    let status: TreeNode['status']
    let order: number | undefined
    let synopsis: string | undefined
    let aliases: string[] | undefined
    let image: string | undefined
    let cover: string | undefined
    let type = fallback
    try {
      const { frontmatter } = parseDoc(await fs.readFile(abs, 'utf8'))
      if (frontmatter.title) title = frontmatter.title
      if (frontmatter.status) status = frontmatter.status
      if (frontmatter.order != null) order = frontmatter.order
      if (frontmatter.synopsis) synopsis = frontmatter.synopsis
      if (frontmatter.aliases && frontmatter.aliases.length > 0) aliases = frontmatter.aliases
      if (frontmatter.type) type = frontmatter.type
      // 갤러리 표지 = 첨부 이미지의 첫 장(캐릭터 얼굴 레퍼런스 등, §6.10).
      const first = (frontmatter.images ?? []).find((p) => IMAGE_EXT.has(extname(p).toLowerCase()))
      if (first) image = first
      // 문서 표지(챕터 표지 §7.6)가 있으면 갤러리에서 이것을 먼저 쓴다.
      if (frontmatter.cover && IMAGE_EXT.has(extname(frontmatter.cover).toLowerCase())) {
        cover = frontmatter.cover
      }
    } catch {
      // 파싱 실패해도 파일명으로 노드는 만든다(견고성).
    }
    return {
      path: relPath,
      name: title,
      isDir: false,
      type,
      status,
      order,
      synopsis,
      aliases,
      image,
      cover
    }
  }

  /**
   * 문서 표지 파일의 프로젝트 상대 경로(§7.6).
   *  · 완성본(제목 포함) `assets/covers/<문서명>.png`
   *  · 원본 아트(글자 없음) `assets/covers/.art/<문서명>.png`
   *
   * 아트를 **점(.)으로 시작하는 폴더**에 두는 이유: scanDir·listAssets가 숨김 항목을 이미 건너뛰므로
   * 자료 갤러리와 AI 전체 목차(§7.5)가 조판용 중간 산출물로 더럽혀지지 않는다(.thumbs와 같은 관례).
   */
  coverPathsFor(docRelPath: string): { cover: string; art: string } {
    const stem = sanitize(basename(docRelPath, extname(docRelPath)))
    return { cover: `${COVER_DIR}/${stem}.png`, art: `${COVER_DIR}/${COVER_ART_DIR}/${stem}.png` }
  }

  /** 제목까지 얹은 문서 표지를 저장한다(base64 PNG). 반환 = 루트 기준 상대 경로. */
  async saveDocCover(docRelPath: string, base64Png: string): Promise<string> {
    const root = this.requireRoot()
    const { cover } = this.coverPathsFor(docRelPath)
    const data = Buffer.from(base64Png.replace(/^data:image\/png;base64,/, ''), 'base64')
    if (data.length < 100) throw new Error('표지 이미지 데이터가 비어 있습니다')
    const abs = toAbs(root, cover)
    await fs.mkdir(dirname(abs), { recursive: true })
    await writeFileAtomic(abs, data)
    return cover
  }

  /** 문서 표지·원본 아트 파일을 지운다(프론트매터 해제는 렌더러가 저장하며 한다). */
  async removeDocCover(docRelPath: string): Promise<void> {
    const root = this.requireRoot()
    const { cover, art } = this.coverPathsFor(docRelPath)
    for (const rel of [cover, art]) {
      await fs.rm(toAbs(root, rel), { force: true })
    }
  }

  async readDoc(relPath: string): Promise<DocContent> {
    const root = this.requireRoot()
    const raw = await fs.readFile(toAbs(root, relPath), 'utf8')
    const { frontmatter, body } = parseDoc(raw)
    return { path: relPath, frontmatter, body }
  }

  /**
   * 책 전체 검색(§6.9) — 4개 섹션의 .md를 매번 스캔해 제목+본문 부분일치를 찾는다.
   *
   * 인덱스(FTS5) 대신 실시간 스캔인 이유(설계 결정 D1, prompt_plan.md): FTS5 기본 토크나이저는
   * 한국어 부분일치가 안 되고, better-sqlite3 네이티브 모듈은 양 OS 빌드 부담이며, 책 한 권
   * 규모(수백 파일)는 스캔으로 충분히 빠르다. "진실은 항상 .md" 원칙에도 부합.
   *
   * 매치 탐색은 이스케이프한 정규식으로 한다 — toLowerCase() 비교는 일부 유니코드에서 길이가
   * 변해 오프셋이 어긋날 수 있다(원문 오프셋이 에디터 selection에 그대로 쓰이므로 어긋나면 안 됨).
   */
  async searchAll(query: string, opts: SearchAllOptions = {}): Promise<SearchAllResult> {
    const root = this.requireRoot()
    if (!query.trim()) return { files: [], totalMatches: 0, truncated: false }
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const flags = opts.caseSensitive ? 'g' : 'gi'
    const titleProbe = new RegExp(escaped, opts.caseSensitive ? '' : 'i')
    const files: SearchFileResult[] = []
    let totalMatches = 0
    let truncated = false
    for (const section of SECTIONS) {
      if (truncated) break
      for (const abs of await this.collectMd(join(root, section.dir))) {
        let frontmatter: ReturnType<typeof parseDoc>['frontmatter']
        let body: string
        try {
          ;({ frontmatter, body } = parseDoc(await fs.readFile(abs, 'utf8')))
        } catch {
          continue // 파싱 실패 문서는 건너뛴다(견고성 — fileNode와 동일 태도)
        }
        const relPath = toRel(root, abs)
        const title = frontmatter.title || basename(relPath, '.md')
        const matches: SearchMatch[] = []
        let fileTruncated = false
        const re = new RegExp(escaped, flags)
        let line = 1
        let countedTo = 0 // 줄 번호는 직전 매치 위치부터 이어 세어 O(n)으로 유지
        for (let m = re.exec(body); m; m = re.exec(body)) {
          if (matches.length >= SEARCH_MAX_PER_FILE) {
            fileTruncated = true
            break
          }
          for (let i = countedTo; i < m.index; i++) if (body.charCodeAt(i) === 10) line++
          countedTo = m.index
          matches.push(makeSearchMatch(body, m.index, m[0].length, line))
          totalMatches++
          if (m.index === re.lastIndex) re.lastIndex++ // 빈 매치 무한루프 방지(방어)
          if (totalMatches >= SEARCH_MAX_TOTAL) {
            truncated = true
            break
          }
        }
        const titleMatch = titleProbe.test(title)
        if (titleMatch || matches.length > 0) {
          files.push({
            path: relPath,
            section: section.dir,
            title,
            titleMatch,
            matches,
            truncated: fileTruncated
          })
        }
        if (truncated) break
      }
    }
    return { files, totalMatches, truncated }
  }

  /** 섹션 폴더 아래 .md 절대경로 수집(숨김 제외, 재귀) — 검색용 가벼운 walk. */
  private async collectMd(absDir: string): Promise<string[]> {
    let entries
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      return []
    }
    const out: string[] = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const child = join(absDir, e.name)
      if (e.isDirectory()) out.push(...(await this.collectMd(child)))
      else if (extname(e.name).toLowerCase() === '.md') out.push(child)
    }
    return out
  }

  async saveDoc(req: SaveDocRequest): Promise<void> {
    const root = this.requireRoot()
    await writeFileAtomic(toAbs(root, req.path), stringifyDoc(req.frontmatter, req.body))
  }

  /** 섹션/부 폴더 안에 새 문서를 만든다. 반환은 갱신된 트리. */
  async createDoc(dirRel: string, type: DocType, title: string): Promise<TreeNode[]> {
    const root = this.requireRoot()
    const dirAbs = toAbs(root, dirRel)
    await fs.mkdir(dirAbs, { recursive: true })
    const fileAbs = await uniquePath(join(dirAbs, `${sanitize(title)}.md`))
    await writeFileAtomic(fileAbs, stringifyDoc({ type, title, status: 'draft' }, ''))
    return this.buildTree()
  }

  /** 문서/폴더(카테고리)를 trash/로 이동(삭제). 최상위 섹션은 보호. */
  async trashEntry(relPath: string): Promise<TreeNode[]> {
    const root = this.requireRoot()
    if (SECTIONS.some((s) => s.dir === relPath)) {
      throw new Error('기본 섹션은 삭제할 수 없습니다')
    }
    const abs = toAbs(root, relPath)
    const trash = join(root, 'trash')
    await fs.mkdir(trash, { recursive: true })
    const dest = await uniquePath(join(trash, basename(abs)))
    await fs.rename(abs, dest)
    return this.buildTree()
  }

  /** 문서/폴더 이름 변경. 문서(.md)는 파일명 + 프론트매터 title을 함께 바꾼다. */
  async renameEntry(relPath: string, newName: string): Promise<TreeNode[]> {
    const root = this.requireRoot()
    if (SECTIONS.some((s) => s.dir === relPath)) {
      throw new Error('기본 섹션은 이름을 바꿀 수 없습니다')
    }
    const abs = toAbs(root, relPath)
    const isMd = extname(abs).toLowerCase() === '.md'
    const safe = sanitize(newName)
    const dest = await uniquePath(join(dirname(abs), isMd ? `${safe}.md` : safe))
    await fs.rename(abs, dest)
    if (isMd) {
      try {
        const { frontmatter, body } = parseDoc(await fs.readFile(dest, 'utf8'))
        frontmatter.title = newName
        await writeFileAtomic(dest, stringifyDoc(frontmatter, body))
      } catch {
        /* 프론트매터 갱신 실패해도 파일명은 바뀜 */
      }
    }
    return this.buildTree()
  }

  /** 섹션/카테고리 안에 새 폴더(카테고리)를 만든다 — 세계관 카테고리 등 사용자 정의. */
  async createFolder(dirRel: string, name: string): Promise<TreeNode[]> {
    const root = this.requireRoot()
    const target = await uniquePath(toAbs(root, `${dirRel}/${sanitize(name)}`))
    await fs.mkdir(target, { recursive: true })
    return this.buildTree()
  }

  /** OS 파일을 assets/로 복사 반입(§6.10). 반환 경로는 상대 POSIX. */
  async ingest(absPaths: string[], targetDirRel?: string): Promise<IngestResult> {
    const root = this.requireRoot()
    const imported: string[] = []
    const skipped: string[] = []
    for (const src of absPaths) {
      const ext = extname(src).toLowerCase()
      const bucket = ASSET_BUCKET[ext]
      const base = targetDirRel ?? (bucket ? `assets/${bucket}` : 'assets/refs')
      const destDir = toAbs(root, base)
      await fs.mkdir(destDir, { recursive: true })
      try {
        const dest = await uniquePath(join(destDir, sanitize(basename(src))))
        await fs.copyFile(src, dest)
        imported.push(toRel(root, dest))
      } catch {
        skipped.push(src)
      }
    }
    return { imported, skipped }
  }

  /** assets/ 폴더를 재귀 스캔해 자료 목록으로(자료 갤러리 §6.10). 최근 수정순. */
  async listAssets(): Promise<import('../../shared/types').AssetItem[]> {
    const root = this.requireRoot()
    const base = join(root, 'assets')
    const out: { item: import('../../shared/types').AssetItem; mtime: number }[] = []
    const walk = async (dir: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue // .thumbs 제외
        const abs = join(dir, e.name)
        if (e.isDirectory()) {
          await walk(abs)
          continue
        }
        const kind = assetKind(e.name)
        if (kind === 'skip') continue
        let mtime = 0
        try {
          mtime = (await fs.stat(abs)).mtimeMs
        } catch {
          /* noop */
        }
        out.push({ item: { path: toRel(root, abs), name: e.name, kind }, mtime })
      }
    }
    await walk(base)
    out.sort((a, b) => b.mtime - a.mtime)
    return out.map((o) => o.item)
  }

  /**
   * 문체 방(style/)을 하네스 블록으로 만든다(§7.2a).
   *  · 지침 = style/ 바로 아래의 .md 전부(보통 문체지침.md) — 통째로, 상한까지
   *  · 참고 = style/samples/ 아래의 .md — 최근 수정순 발췌(문체만 참고하라고 못박는다)
   *
   * 씨앗의 "예)" 줄은 **보내지 않는다**. 사용자가 안 고친 예시가 진짜 규칙처럼 굳는 것을 막는다.
   */
  private async buildStyleBlock(): Promise<{
    parts: string[]
    chips: import('../../shared/types').AIContextChip[]
  }> {
    const root = this.requireRoot()
    const dir = join(root, STYLE_DIR)
    const parts: string[] = []
    const chips: import('../../shared/types').AIContextChip[] = []

    // ① 지침 — style/ 직속 .md(파일명순). 여러 장으로 나눠 써도 다 모은다.
    let names: string[] = []
    try {
      names = (await fs.readdir(dir, { withFileTypes: true }))
        .filter((e) => e.isFile() && !e.name.startsWith('.') && extname(e.name).toLowerCase() === '.md')
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'ko'))
    } catch {
      return { parts, chips } // 문체 방이 아직 없다
    }
    let guide = ''
    for (const name of names) {
      if (Array.from(guide).length >= STYLE_GUIDE_CAP) break
      try {
        const { body } = parseDoc(await fs.readFile(join(dir, name), 'utf8'))
        const t = stripExampleLines(body)
        if (t) guide += (guide ? '\n\n' : '') + t
      } catch {
        /* 읽기 실패한 지침은 건너뛴다 */
      }
    }
    guide = guide.slice(0, STYLE_GUIDE_CAP).trim()
    if (guide) {
      parts.push(
        `## 문체 지침 — 최우선. 반드시 이 문체로 쓸 것\n(아래 지침은 다른 어떤 요청보다 우선합니다.)\n\n${guide}`
      )
      chips.push({ label: '✍ 문체 지침', kind: 'style' })
    }

    // ② 참고 원고 — 최근 수정순으로 발췌. "문체만" 보라고 명시한다.
    const sampleDir = join(dir, STYLE_SAMPLES)
    const found: { name: string; abs: string; mtime: number }[] = []
    const walk = async (d: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const abs = join(d, e.name)
        if (e.isDirectory()) {
          await walk(abs)
        } else if (extname(e.name).toLowerCase() === '.md') {
          let mtime = 0
          try {
            mtime = (await fs.stat(abs)).mtimeMs
          } catch {
            /* noop */
          }
          found.push({ name: e.name, abs, mtime })
        }
      }
    }
    await walk(sampleDir)
    found.sort((a, b) => b.mtime - a.mtime)

    let budget = STYLE_SAMPLE_BUDGET
    const excerpts: string[] = []
    for (const s of found) {
      if (budget <= 0) break
      try {
        const { body } = parseDoc(await fs.readFile(s.abs, 'utf8'))
        const text = body.trim().slice(0, Math.min(STYLE_SAMPLE_EACH, budget))
        if (!text) continue
        budget -= Array.from(text).length
        excerpts.push(`#### ${basename(s.name, '.md')}\n${text}`)
      } catch {
        /* 건너뜀 */
      }
    }
    if (excerpts.length > 0) {
      parts.push(
        `### 문체 참고 — 아래 글의 **문체만** 따르세요(줄거리·인물·설정은 이 소설과 무관하니 가져오지 마세요)\n\n${excerpts.join('\n\n')}`
      )
      chips.push({ label: `문체 참고 ${excerpts.length}편`, kind: 'style' })
    }
    return { parts, chips }
  }

  /**
   * AI가 "항상 보는" 집필 맥락을 조립한다(BLUEPRINT §7.2).
   *  ⓪ 문체 하네스 — style/ 방의 지침·참고 원고(맨 앞. 다른 무엇보다 먼저 읽히게 한다)
   *  ① 시놉시스 체인 — 모든 원고 챕터의 시놉시스(장편에서도 흐름 유지, 본문 대신 요약)
   *  ② 현재 장면 — 지금 열려 있는 문서의 실시간 본문(넘겨받은 currentBody)
   *  ③ 등장 설정 자동 감지 — 현재 장면에 이름이 나오는 캐릭터·세계관 시트를 통째로 포함
   */
  async buildAiContext(
    currentPath: string | null,
    currentBody: string,
    includeAssets = true,
    includeStyle = true
  ): Promise<import('../../shared/types').AIContext> {
    const root = this.requireRoot()
    const tree = await this.buildTree()
    const flat: TreeNode[] = []
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        if (n.isDir) walk(n.children ?? [])
        else flat.push(n)
      }
    }
    walk(tree)

    const chips: import('../../shared/types').AIContextChip[] = []
    const parts: string[] = []
    /** 이미 내용을 통째로 실은 파일 — 목차에 ✓로 표시해 AI가 다시 열람 요청하지 않게 한다. */
    const included = new Set<string>()
    let manifestTitle = '소설'
    try {
      manifestTitle = (await this.readManifest()).title || manifestTitle
    } catch {
      /* noop */
    }

    // ⓪ 문체 하네스 — 무조건 맨 앞. 뒤에 무엇이 오든 "이 문체로 쓴다"가 먼저 읽혀야 한다.
    if (includeStyle) {
      const style = await this.buildStyleBlock()
      parts.push(...style.parts)
      chips.push(...style.chips)
    }

    // ① 전체 흐름 체인 — 원고 챕터를 order순으로 **모두** 나열한다(시놉시스 없는 챕터도 스켈레톤에
    //    포함해 AI가 "이 챕터가 존재한다"는 것까지 알게 한다). 줄거리가 없으면 그 사실을 명시한다.
    const chapters = flat
      .filter((n) => n.path.startsWith('manuscript/'))
      .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))
    if (chapters.length > 0) {
      const lines = chapters
        .map((c) => {
          const here = c.path === currentPath ? ' (지금 이 장면)' : ''
          const syn = c.synopsis?.trim() ? c.synopsis.trim() : '(줄거리 미작성)'
          return `- ${c.name}${here}: ${syn}`
        })
        .join('\n')
      parts.push(`## 전체 흐름(챕터 목록·줄거리)\n${lines}`)
      const withSyn = chapters.filter((c) => c.synopsis?.trim()).length
      chips.push({
        label:
          withSyn < chapters.length
            ? `흐름 ${chapters.length}장(줄거리 ${withSyn})`
            : `흐름 ${chapters.length}장`,
        kind: 'synopsis'
      })
    }

    // ② 현재 장면(실시간 본문) — 길면 앞부분만 보낸다는 사실을 칩에 드러낸다(투명성).
    const SCENE_CAP = 6000
    const sceneTitle =
      flat.find((n) => n.path === currentPath)?.name ?? (currentPath ? basename(currentPath, '.md') : '')
    if (currentPath && currentBody.trim()) {
      const total = Array.from(currentBody).length
      const truncated = total > SCENE_CAP
      const scene = currentBody.slice(0, SCENE_CAP)
      parts.push(
        `## 현재 장면: ${sceneTitle}${truncated ? ` (앞 ${SCENE_CAP}자만, 전체 ${total}자)` : ''}\n${scene}`
      )
      chips.push({
        label: truncated ? `현재 장면: ${sceneTitle} (앞 ${SCENE_CAP}자)` : `현재 장면: ${sceneTitle}`,
        kind: 'scene'
      })
      if (!truncated) included.add(currentPath)
    }

    // ③ 등장 설정 자동 감지(캐릭터·세계관) — 이름 또는 별칭(aliases)이 현재 장면에 나오면 시트를 통째로
    //    포함한다. 경로 기반이라 사용자가 만든 카테고리도 자동 인식. 별칭 덕에 "그/성만/애칭"도 잡는다.
    for (const node of flat) {
      if (node.path === currentPath) continue
      const isCharacter = node.path.startsWith('characters/')
      const isWorld = node.path.startsWith('world/')
      if (!isCharacter && !isWorld) continue
      const name = (node.name || '').trim()
      const terms = [name, ...(node.aliases ?? [])]
        .map((s) => s.trim())
        .filter((s) => s.length >= 2)
      if (terms.length === 0 || !terms.some((term) => currentBody.includes(term))) continue
      try {
        const raw = await fs.readFile(toAbs(root, node.path), 'utf8')
        const { frontmatter, body } = parseDoc(raw)
        const head = isCharacter ? '캐릭터' : '설정'
        const aliasLine =
          frontmatter.aliases && frontmatter.aliases.length > 0
            ? `(별칭: ${frontmatter.aliases.join(', ')})\n`
            : ''
        const full = `${aliasLine}${frontmatter.synopsis ? frontmatter.synopsis + '\n' : ''}${body}`
        const sheet = full.slice(0, 1800)
        parts.push(`## ${head}: ${name}\n${sheet}`)
        chips.push({ label: name, kind: isCharacter ? 'character' : 'world' })
        if (full.length === sheet.length) included.add(node.path) // 잘렸으면 열람 요청을 허용한다
      } catch {
        /* 읽기 실패 시 건너뜀 */
      }
    }

    // ④ 자료 폴더 내용 — 문서(PDF·텍스트)는 예산 한도로 자동 포함(§7.5). 목록은 ⑤ 목차가 맡는다.
    let assets: import('../../shared/types').AssetItem[] = []
    if (includeAssets) {
      assets = await this.listAssets()
      const docs = assets.filter((a) => a.kind === 'other' && isAttachableDocName(a.name))

      // 최근 수정순(= listAssets 정렬)으로 예산이 닿는 데까지.
      let budget = ASSET_READ_BUDGET
      const readParts: string[] = []
      for (const d of docs) {
        if (budget <= 0) break
        const full = await this.extractText(d.path)
        if (!full) continue
        const slice = full.slice(0, budget)
        budget -= Array.from(slice).length
        const cut =
          full.length > slice.length
            ? `\n…(이하 생략 — 전체가 필요하면 [[열람: ${d.path}]]로 요청하세요)`
            : ''
        readParts.push(`### ${d.path}\n${slice}${cut}`)
        chips.push({ label: d.name, kind: 'asset' })
        included.add(d.path)
      }
      if (readParts.length > 0) parts.push(`## 자료 내용(자동으로 읽은 것)\n${readParts.join('\n\n')}`)
    }

    // ⑤ 프로젝트 전체 목차 — 폴더 안에 무엇이 있는지 **전부** 알린다. 여기 없는 건 존재하지 않는 것이고,
    //    목록에만 있는 것은 [[열람: 경로]]로 요청하면 앱이 읽어 준다(§7.5 열람 프로토콜).
    const docLines = flat.map((n) => {
      const mark = included.has(n.path) ? '✓ ' : ''
      const syn = n.synopsis?.trim() ? ` — ${n.synopsis.trim().slice(0, 80)}` : ''
      const title = n.name && n.name !== basename(n.path, '.md') ? ` (${n.name})` : ''
      return `- ${mark}${n.path}${title}${syn}`
    })
    const assetLines = assets.map((a) => {
      const mark = included.has(a.path) ? '✓ ' : ''
      const kind = a.kind === 'image' ? '이미지' : a.kind === 'video' ? '영상' : '문서'
      return `- ${mark}${a.path} (${kind})`
    })
    const all = [...docLines, ...assetLines]
    if (all.length > 0) {
      const shown = all.slice(0, INDEX_MAX)
      const extra = all.length - shown.length
      parts.push(
        [
          '## 프로젝트 전체 목차(폴더 안의 모든 파일)',
          '✓ 표시는 위에 내용이 이미 들어 있는 파일입니다. 표시가 없는 파일의 내용이 필요하면',
          '**추측하지 말고** 답변 대신 `[[열람: 경로]]` 줄만 출력하세요(한 번에 최대 5개).',
          '앱이 그 파일을 읽어 다시 물어봅니다. 이미지도 같은 방식으로 열어 볼 수 있습니다.',
          '',
          shown.join('\n') + (extra > 0 ? `\n- …외 ${extra}개` : '')
        ].join('\n')
      )
    }

    const text = parts.length
      ? `다음은 지금 집필 중인 소설 「${manifestTitle}」의 맥락입니다. 답할 때 항상 이 맥락(문체·등장인물·설정·흐름·자료)을 지키세요.\n\n${parts.join('\n\n')}`
      : ''
    const estTokens = Math.ceil(Array.from(text).length / 2.5)
    return { text, chips, estTokens }
  }

  /** 자료에서 텍스트를 뽑는다 — PDF는 unpdf(지연 로드, 실패 시 빈 문자열), 그 외는 UTF-8로 읽는다. */
  private async extractText(relPath: string): Promise<string> {
    const abs = toAbs(this.requireRoot(), relPath)
    const ext = extname(abs).toLowerCase()
    if (ext === '.pdf') {
      let mtime = 0
      try {
        mtime = (await fs.stat(abs)).mtimeMs
      } catch {
        return ''
      }
      const cached = this.pdfCache.get(abs)
      if (cached && cached.mtime === mtime) return cached.text
      let text = ''
      try {
        const { extractText, getDocumentProxy } = await import('unpdf')
        const buf = await fs.readFile(abs)
        const pdf = await getDocumentProxy(new Uint8Array(buf))
        const res = await extractText(pdf, { mergePages: true })
        text = Array.isArray(res.text) ? res.text.join('\n') : String(res.text ?? '')
      } catch {
        text = '' // 손상·암호화·스캔본 등 — 조용히 빈 문자열(호출부가 안내)
      }
      this.pdfCache.set(abs, { mtime, text })
      return text.trim()
    }
    try {
      return (await fs.readFile(abs, 'utf8')).trim()
    } catch {
      return ''
    }
  }

  /** 자료의 첨부 가능 여부·요약(렌더러 칩·토큰 추정용). 실제 데이터는 담지 않는다(§7.5). */
  async attachmentInfo(relPath: string): Promise<AIAttachmentInfo> {
    const name = basename(relPath)
    const ext = extname(relPath).toLowerCase()
    if (IMAGE_EXT.has(ext)) {
      let size = 0
      try {
        size = (await fs.stat(toAbs(this.requireRoot(), relPath))).size
      } catch {
        /* noop */
      }
      return {
        kind: 'image',
        name,
        path: relPath,
        mediaType: mimeOf(ext),
        ok: true,
        note: `이미지 · ${fmtSize(size)}`
      }
    }
    if (ext === '.pdf' || TEXT_EXT.has(ext)) {
      const text = await this.extractText(relPath)
      const chars = Array.from(text).length
      const label = ext === '.pdf' ? 'PDF' : '텍스트'
      return {
        kind: 'text',
        name,
        path: relPath,
        chars,
        ok: chars > 0,
        note:
          chars > 0
            ? `${label} · 약 ${chars.toLocaleString('ko')}자`
            : ext === '.pdf'
              ? 'PDF에서 글자를 찾지 못함(스캔본일 수 있음)'
              : '빈 파일'
      }
    }
    return { kind: 'text', name, path: relPath, ok: false, note: '지원하지 않는 자료 형식' }
  }

  /**
   * 열람 프로토콜(§7.5) — AI가 `[[열람: 경로]]`로 요청한 파일을 읽어 첨부로 돌려준다.
   *
   * 경로 검증은 resolve()가 맡는다(프로젝트 밖으로 나가는 `..`는 여기서 막힌다). 읽을 수 없는 파일은
   * **조용히 빼지 않고** 그 사실을 텍스트로 돌려준다 — AI가 "없는 파일을 봤다"고 착각하지 않게.
   */
  async readForAi(paths: string[]): Promise<AIAttachment[]> {
    const out: AIAttachment[] = []
    let budget = OPEN_TOTAL
    for (const raw of paths.slice(0, OPEN_MAX_FILES)) {
      const relPath = String(raw).trim().replace(/\\/g, '/').replace(/^\/+/, '')
      const name = basename(relPath)
      if (!relPath) continue
      let abs: string
      try {
        abs = this.resolve(relPath) // 프로젝트 밖 경로는 여기서 throw
      } catch {
        out.push({ kind: 'text', name, path: relPath, text: '(열 수 없는 경로입니다)' })
        continue
      }
      try {
        await fs.access(abs)
      } catch {
        out.push({ kind: 'text', name, path: relPath, text: '(그런 파일이 없습니다)' })
        continue
      }
      const ext = extname(relPath).toLowerCase()
      if (IMAGE_EXT.has(ext)) {
        // base64는 여기서 싣지 않는다 — 생성 직전 main이 resolveAttachment로 채운다(이중 IPC 회피 §7.5).
        out.push({ kind: 'image', name, path: relPath, mediaType: mimeOf(ext) })
        continue
      }
      if (budget <= 0) break
      // 한글(.hwp)·워드(.docx) 등은 바이너리라 그대로 읽으면 깨진 글자가 나온다 — 읽지 않고 사실대로 알린다.
      if (!isAttachableDocName(name)) {
        out.push({
          kind: 'text',
          name,
          path: relPath,
          text: `(${ext || '이 형식'}은 앱이 글자를 뽑지 못합니다 — .md·.txt·.pdf로 바꿔 넣어 주세요)`
        })
        continue
      }
      const full = ext === '.md' ? await this.readMdForAi(abs) : await this.extractText(relPath)
      if (!full) {
        out.push({
          kind: 'text',
          name,
          path: relPath,
          text: '(글자를 뽑을 수 없습니다 — 빈 파일이거나 스캔한 PDF일 수 있습니다)'
        })
        continue
      }
      const cap = Math.min(OPEN_PER_FILE, budget)
      const text = full.slice(0, cap)
      budget -= Array.from(text).length
      out.push({
        kind: 'text',
        name,
        path: relPath,
        text: full.length > text.length ? `${text}\n…(이하 생략)` : text
      })
    }
    return out
  }

  /** .md는 프론트매터의 제목·줄거리까지 붙여 넘긴다(맥락 손실 방지). */
  private async readMdForAi(abs: string): Promise<string> {
    try {
      const { frontmatter, body } = parseDoc(await fs.readFile(abs, 'utf8'))
      const head = [
        frontmatter.title ? `제목: ${frontmatter.title}` : '',
        frontmatter.synopsis ? `줄거리: ${frontmatter.synopsis}` : '',
        frontmatter.aliases?.length ? `별칭: ${frontmatter.aliases.join(', ')}` : ''
      ]
        .filter(Boolean)
        .join('\n')
      return head ? `${head}\n\n${body}` : body
    } catch {
      return ''
    }
  }

  /** 첨부 참조를 실제 데이터로 채운다(생성 직전 main에서 호출) — 이미지=base64, PDF·텍스트=추출 텍스트. */
  async resolveAttachment(relPath: string): Promise<AIAttachment> {
    const name = basename(relPath)
    const ext = extname(relPath).toLowerCase()
    const abs = toAbs(this.requireRoot(), relPath)
    if (IMAGE_EXT.has(ext)) {
      const buf = await fs.readFile(abs)
      return {
        kind: 'image',
        name,
        path: relPath,
        absPath: abs, // CLI 계열은 base64 대신 이 경로로 파일을 직접 연다(§7.5)
        mediaType: mimeOf(ext),
        dataBase64: buf.toString('base64')
      }
    }
    return { kind: 'text', name, path: relPath, absPath: abs, text: await this.extractText(relPath) }
  }

  /**
   * 레거시 위키링크 이미지 임베드(![[루트경로]])를 표준 마크다운(![](문서기준 상대경로))으로
   * 일괄 변환한다(§6.10 호환성). 다른 프로그램(VS Code·GitHub·옵시디언 등)에서도 이미지가 열리게.
   * 변경 전 원본을 snapshots/embed-migration-<시각>/ 아래에 그대로 백업한다(되돌리기 대비).
   */
  async convertLegacyEmbeds(): Promise<{ files: number; embeds: number }> {
    const root = this.requireRoot()
    const mdFiles: string[] = []
    const walk = async (absDir: string): Promise<void> => {
      let entries
      try {
        entries = await fs.readdir(absDir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const abs = join(absDir, e.name)
        if (e.isDirectory()) await walk(abs)
        else if (extname(e.name).toLowerCase() === '.md') mdFiles.push(toRel(root, abs))
      }
    }
    for (const s of SECTIONS) await walk(join(root, s.dir))

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const snapDir = join(root, 'snapshots', `embed-migration-${stamp}`)
    let files = 0
    let embeds = 0
    for (const rel of mdFiles) {
      const abs = toAbs(root, rel)
      let raw: string
      try {
        raw = await fs.readFile(abs, 'utf8')
      } catch {
        continue
      }
      let count = 0
      const docDir = posixDir(rel)
      const next = raw.replace(/!\[\[([^\]]+?)\]\]/g, (_m, inner: string) => {
        count += 1
        // 옵시디언 별칭(![[경로|별칭]])이 있으면 경로만 취한다. 앱은 루트 기준 경로를 기록해 왔다.
        const assetRootRel = String(inner).split('|')[0].trim().replace(/\\/g, '/').replace(/^\/+/, '')
        return `![](${encodeEmbedUrl(relPosix(docDir, assetRootRel))})`
      })
      if (count === 0 || next === raw) continue
      const snapPath = join(snapDir, rel)
      await fs.mkdir(dirname(snapPath), { recursive: true })
      await fs.writeFile(snapPath, raw) // 원본 백업(변환 전 그대로)
      await writeFileAtomic(abs, next)
      files += 1
      embeds += count
    }
    return { files, embeds }
  }

  /** 상대경로를 절대경로로(preload의 assetUrl·revealInOs가 사용). */
  resolve(relPath: string): string {
    return toAbs(this.requireRoot(), relPath)
  }
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv', '.m4v'])
/** AI 첨부로 텍스트를 추출할 수 있는 일반 텍스트 확장자(PDF는 별도 경로). */
const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.log'])
/**
 * 자료 갤러리·AI 목차에 '문서'로 표시할 확장자(PDF·텍스트·오디오 + 한글/워드/전자책).
 * 한글·워드는 앱이 글자를 못 뽑지만 **있다는 사실은 알려야** 한다 — 목록에 없으면 없는 파일이 된다.
 * 실제로 읽을 수 있는지는 isAttachableDocName()이 따로 판단한다.
 */
const DOC_EXT = new Set([
  '.pdf',
  '.mp3',
  '.wav',
  '.hwp',
  '.hwpx',
  '.doc',
  '.docx',
  '.rtf',
  '.odt',
  '.epub',
  ...TEXT_EXT
])

/** 이미지 확장자 → MIME. vision 입력의 media_type/data URL에 쓴다. svg는 대부분 미지원이라 png 취급 회피. */
function mimeOf(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

/** AI가 텍스트로 읽을 수 있는 문서인가(PDF·텍스트 계열). 오디오 등은 제외. */
function isAttachableDocName(name: string): boolean {
  const ext = extname(name).toLowerCase()
  return ext === '.pdf' || TEXT_EXT.has(ext)
}

/** 바이트 → 사람이 읽는 크기. */
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function assetKind(name: string): 'image' | 'video' | 'other' | 'skip' {
  const ext = extname(name).toLowerCase()
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (DOC_EXT.has(ext)) return 'other'
  return 'skip'
}

function sortNodes(a: TreeNode, b: TreeNode): number {
  /**
   * **문서 우선 → 폴더 → order → 이름.**
   *
   * 폴더를 위에 올리면 그 섹션의 알맹이(문체 방의 `문체지침.md`, 원고의 프롤로그)가 하위 폴더에
   * 밀려 한참 아래로 내려간다. 섹션을 열었을 때 "이 섹션이 무엇인지"를 알려 주는 문서가 먼저
   * 보이고, 묶음(폴더)은 그 아래 서랍처럼 놓이는 편이 읽기 쉽다(사용자 지적 §6.2).
   */
  if (a.isDir !== b.isDir) return a.isDir ? 1 : -1
  const ao = a.order ?? Number.POSITIVE_INFINITY
  const bo = b.order ?? Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return a.name.localeCompare(b.name, 'ko')
}

/**
 * 문체 지침에서 **AI에게 보내지 않을 것**을 걷어낸다.
 *  · `<!-- … -->` 주석 — 사용법 안내(사람만 본다)
 *  · "예)"로 시작하는 줄 — 씨앗의 예시. 사용자가 안 고친 예시가 진짜 규칙처럼 굳는 것을 막는다.
 * 걷어낸 뒤 제목(#)만 남으면 지침이 없는 것으로 본다.
 */
function stripExampleLines(text: string): string {
  const kept = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => !/^\s*예\s*[)）]/.test(line))
    .join('\n')
    .trim()
  const hasSubstance = kept
    .split('\n')
    .some((line) => line.trim() && !line.trim().startsWith('#'))
  return hasSubstance ? kept : ''
}

/** 문체 방 씨앗 — 빈 화면 대신 "무엇을 적으면 되는지"를 보여 주는 뼈대. */
const STYLE_GUIDE_SEED = `<!--
이 문서에 적은 내용은 **모든 AI 요청에 항상** 실려, AI가 이 문체로만 쓰게 만듭니다.
· 이 주석과 "예)"로 시작하는 줄은 AI에게 전달되지 않습니다 — 지우고 직접 쓰세요.
· 저장하면 즉시 반영됩니다.
· 문체를 보여 줄 기존 원고가 있다면 style/samples/ 에 .md로 넣어 두세요(AI가 문체만 참고합니다).
-->


## 시점·인칭
예) 3인칭 제한 시점. 주인공의 시야 밖은 서술하지 않는다.

## 문장
예) 짧은 문장 위주. 한 문장 40자 안팎. 접속부사로 시작하지 않는다.

## 어미·말투
예) '-았다/-었다' 과거형 중심. 감탄부호는 쓰지 않는다.

## 대사
예) 큰따옴표. 대사 뒤 지문은 줄을 바꿔 짧게.

## 묘사
예) 감각 하나(소리 또는 냄새)를 반드시 넣는다. 비유는 한 문단에 하나까지.

## 피할 것
예) 클리셰 표현, 과한 수식어, 설명조 서술, 인물 감정 직접 진술("그는 슬펐다").
`

/**
 * 문체 방(style/)을 보강한다 — 폴더와 지침 씨앗을 **없을 때만** 만든다(기존 내용은 절대 건드리지 않는다).
 * 새 책은 create()가, 옛 책은 open()이 부른다.
 */
async function ensureStyleRoom(dir: string): Promise<void> {
  await fs.mkdir(join(dir, STYLE_DIR, STYLE_SAMPLES), { recursive: true })
  const guide = join(dir, STYLE_DIR, '문체지침.md')
  try {
    await fs.access(guide)
  } catch {
    await writeFileAtomic(
      guide,
      stringifyDoc({ type: 'style', title: '문체지침' }, STYLE_GUIDE_SEED)
    )
  }
}

/** 파일명에서 경로 구분자·금지문자 제거(경로 주입 방지). */
function sanitize(name: string): string {
  const base = basename(name).replace(/[\\/:*?"<>|]/g, '_').trim()
  return base || 'untitled'
}

/** 이미 있으면 " (2)", " (3)"… 을 붙여 충돌을 피한다. */
async function uniquePath(abs: string): Promise<string> {
  const ext = extname(abs)
  const stem = abs.slice(0, abs.length - ext.length)
  let candidate = abs
  let n = 2
  for (;;) {
    try {
      await fs.access(candidate)
      candidate = `${stem} (${n})${ext}`
      n += 1
    } catch {
      return candidate
    }
  }
}

/**
 * 매치 한 건의 미리보기를 만든다 — 매치가 든 줄 안에서, 매치 앞 40자·뒤 60자로 클립.
 * from/to는 본문 기준 오프셋 그대로(에디터 selection에 직결), previewFrom/To는 preview 안 위치.
 */
function makeSearchMatch(body: string, index: number, len: number, line: number): SearchMatch {
  const lineStart = body.lastIndexOf('\n', index - 1) + 1
  const nl = body.indexOf('\n', index)
  const lineEnd = nl === -1 ? body.length : nl
  const previewStart = Math.max(lineStart, index - 40)
  const previewEnd = Math.min(lineEnd, index + len + 60)
  return {
    line,
    from: index,
    to: index + len,
    preview: body.slice(previewStart, previewEnd),
    previewFrom: index - previewStart,
    previewTo: index - previewStart + len
  }
}

export const projectService = new ProjectService()
export { toAbs, toRel }
