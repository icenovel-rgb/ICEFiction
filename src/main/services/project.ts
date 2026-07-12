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
  TreeNode
} from '../../shared/types'
import { writeFileAtomic } from '../lib/atomic'
import { parseDoc, stringifyDoc } from '../lib/frontmatter'
import { encodeEmbedUrl, posixDir, relPosix } from '../../shared/mdEmbed'

const SCHEMA_VERSION = 1
const MANIFEST = 'icefiction.json'

/** 바인더에 노출하는 최상위 섹션과 그 안 문서의 기본 타입.
 *  세계관 하위 카테고리(장소·세력 등)는 기본 제공하지 않는다 — 사용자가 폴더로 자유 구성한다. */
const SECTIONS: { dir: string; type: DocType }[] = [
  { dir: 'manuscript', type: 'chapter' },
  { dir: 'characters', type: 'character' },
  { dir: 'world', type: 'world' },
  { dir: 'notes', type: 'note' }
]

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
    await writeFileAtomic(
      join(dir, 'manuscript', '01-첫-장.md'),
      stringifyDoc(
        { type: 'chapter', title: '첫 장', status: 'draft', order: 1 },
        '여기서부터 시작하세요.\n'
      )
    )
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
    } catch {
      // 파싱 실패해도 파일명으로 노드는 만든다(견고성).
    }
    return { path: relPath, name: title, isDir: false, type, status, order, synopsis, aliases, image }
  }

  async readDoc(relPath: string): Promise<DocContent> {
    const root = this.requireRoot()
    const raw = await fs.readFile(toAbs(root, relPath), 'utf8')
    const { frontmatter, body } = parseDoc(raw)
    return { path: relPath, frontmatter, body }
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
   * AI가 "항상 보는" 집필 맥락을 조립한다(BLUEPRINT §7.2).
   *  ① 시놉시스 체인 — 모든 원고 챕터의 시놉시스(장편에서도 흐름 유지, 본문 대신 요약)
   *  ② 현재 장면 — 지금 열려 있는 문서의 실시간 본문(넘겨받은 currentBody)
   *  ③ 등장 설정 자동 감지 — 현재 장면에 이름이 나오는 캐릭터·세계관 시트를 통째로 포함
   */
  async buildAiContext(
    currentPath: string | null,
    currentBody: string,
    includeAssets = true
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
    let manifestTitle = '소설'
    try {
      manifestTitle = (await this.readManifest()).title || manifestTitle
    } catch {
      /* noop */
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
        const sheet = `${aliasLine}${frontmatter.synopsis ? frontmatter.synopsis + '\n' : ''}${body}`.slice(0, 1800)
        parts.push(`## ${head}: ${name}\n${sheet}`)
        chips.push({ label: name, kind: isCharacter ? 'character' : 'world' })
      } catch {
        /* 읽기 실패 시 건너뜀 */
      }
    }

    // ④ 자료 폴더 — AI가 스스로 훑어 읽는다(§7.5). 문서(PDF·텍스트)는 내용을 예산 한도로 자동 포함하고
    //    이미지는 목록만(무거워서 실제로 보려면 📎 첨부=vision). 어떤 파일이 있는지 "목록"으로도 알린다.
    if (includeAssets) {
      const assets = await this.listAssets()
      const docs = assets.filter((a) => a.kind === 'other' && isAttachableDocName(a.name))
      const images = assets.filter((a) => a.kind === 'image')
      const inventory = [...docs, ...images]
        .slice(0, 40)
        .map((a) => `- ${a.name} (${a.kind === 'image' ? '이미지' : '문서'})`)
      const extra = docs.length + images.length - inventory.length

      // 문서 내용 자동 읽기(예산 한도 내, 최근 수정순 = listAssets 정렬).
      let budget = 8000
      const readParts: string[] = []
      for (const d of docs) {
        if (budget <= 0) break
        const full = await this.extractText(d.path)
        if (!full) continue
        const slice = full.slice(0, budget)
        budget -= Array.from(slice).length
        const cut = full.length > slice.length ? '\n…(이하 생략 — 전체가 필요하면 말씀하세요)' : ''
        readParts.push(`### ${d.name}\n${slice}${cut}`)
        chips.push({ label: d.name, kind: 'asset' })
      }

      if (inventory.length > 0 || readParts.length > 0) {
        const invBlock =
          inventory.length > 0
            ? `자료 폴더 목록:\n${inventory.join('\n')}${extra > 0 ? `\n- …외 ${extra}개` : ''}`
            : ''
        const readBlock =
          readParts.length > 0 ? `\n\n자료 내용:\n${readParts.join('\n\n')}` : ''
        parts.push(`## 자료 폴더(참고 자료)\n${invBlock}${readBlock}`)
        if (readParts.length === 0 && images.length > 0) {
          // 읽을 문서는 없고 이미지만 있을 때 — 목록만 있다는 걸 칩으로 알림.
          chips.push({ label: `자료 ${images.length}개(이미지)`, kind: 'asset' })
        }
      }
    }

    const text = parts.length
      ? `다음은 지금 집필 중인 소설 「${manifestTitle}」의 맥락입니다. 답할 때 항상 이 맥락(등장인물·설정·흐름·자료)을 지키세요.\n\n${parts.join('\n\n')}`
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

  /** 첨부 참조를 실제 데이터로 채운다(생성 직전 main에서 호출) — 이미지=base64, PDF·텍스트=추출 텍스트. */
  async resolveAttachment(relPath: string): Promise<AIAttachment> {
    const name = basename(relPath)
    const ext = extname(relPath).toLowerCase()
    if (IMAGE_EXT.has(ext)) {
      const buf = await fs.readFile(toAbs(this.requireRoot(), relPath))
      return { kind: 'image', name, path: relPath, mediaType: mimeOf(ext), dataBase64: buf.toString('base64') }
    }
    return { kind: 'text', name, path: relPath, text: await this.extractText(relPath) }
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
/** 자료 갤러리에 '문서'로 표시할 확장자(PDF·텍스트·오디오). AI 첨부 가능 여부는 attachmentInfo가 판단. */
const DOC_EXT = new Set(['.pdf', '.mp3', '.wav', ...TEXT_EXT])

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
  // 폴더 우선 → order → 이름.
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  const ao = a.order ?? Number.POSITIVE_INFINITY
  const bo = b.order ?? Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return a.name.localeCompare(b.name, 'ko')
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

export const projectService = new ProjectService()
export { toAbs, toRel }
