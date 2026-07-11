/**
 * ICEFiction 공유 타입 — main ↔ renderer IPC 계약의 단일 정본.
 *
 * 진실의 원천은 항상 프로젝트 폴더의 .md 파일이다(BLUEPRINT §4). 이 타입들은 그 파일을
 * 파싱한 메모리 표현일 뿐이며, 렌더러는 파일시스템에 직접 접근하지 않고 이 계약으로만 오간다.
 */

/** 문서 종류. 폴더 위치와 프론트매터 type이 함께 결정한다. */
export type DocType =
  | 'chapter' // 원고 (manuscript/)
  | 'character' // 캐릭터 (characters/)
  | 'world' // 세계관 문서 (world/ — 카테고리는 사용자가 폴더로 자유 구성)
  | 'location' // (구) 세계관: 장소 — 하위호환
  | 'faction' // (구) 세계관: 세력 — 하위호환
  | 'rule' // (구) 세계관: 설정·규칙 — 하위호환
  | 'glossary' // (구) 세계관: 용어집 — 하위호환
  | 'note' // 자유 노트 (notes/)
  | 'part' // 부(Part) 폴더 — 원고 계층
  | 'folder' // 일반 폴더(카테고리)

/** 원고 집필 상태 배지. */
export type DocStatus = 'draft' | 'revising' | 'done'

/** 문서 프론트매터(YAML). 알려진 필드 + 커스텀 필드는 extra로 보존. */
export interface Frontmatter {
  type?: DocType
  title?: string
  status?: DocStatus
  pov?: string
  synopsis?: string
  order?: number
  wordsTarget?: number
  /** 별칭·호칭 — 캐릭터가 본문에서 "그", 성/이름만, 별명 등으로 불릴 때 AI 컨텍스트 감지에 쓴다(§7.2). */
  aliases?: string[]
  /** 이 문서에 첨부된 이미지·자료(프로젝트 루트 기준 상대 POSIX 경로) — 캐릭터 얼굴 레퍼런스 등(§6.10). */
  images?: string[]
  /** 파서가 모르는 필드는 손실 없이 여기 보존해 저장 시 되돌려 쓴다. */
  extra?: Record<string, unknown>
}

/** 바인더 트리의 한 노드(문서 또는 폴더). 프로젝트 루트 기준 상대·POSIX 경로. */
export interface TreeNode {
  /** 프로젝트 루트 기준 상대경로 (POSIX `/`). 이식성의 핵심 — 절대경로 금지(§6.11). */
  path: string
  name: string // 표시 이름 (프론트매터 title 우선, 없으면 파일명)
  isDir: boolean
  type: DocType
  status?: DocStatus
  order?: number
  synopsis?: string // 시놉시스 체인·컨텍스트용(§7.2)
  aliases?: string[] // 캐릭터·설정 별칭 — 컨텍스트 자동 감지용(§7.2)
  children?: TreeNode[]
}

/** 프로젝트(=책) 매니페스트 (icefiction.json). */
export interface ProjectManifest {
  schemaVersion: number
  title: string
  createdAt: string
  /** 최상위 섹션 표시 순서. */
  sections?: string[]
}

/** 서재(책장)에 놓인 책 한 권의 요약. id = 서재 안 폴더명. */
export interface BookSummary {
  id: string // 서재 루트 기준 폴더명
  title: string
  updatedAt: string // ISO — 마지막 수정 시각(정렬용)
  chapterCount: number
}

/** 서재 = 모든 책을 담는 단일 보관 경로 + 그 안 책 목록(BLUEPRINT §0.2·ICEWriter 방식). */
export interface LibraryInfo {
  dir: string // 서재 절대경로(표시·변경용)
  books: BookSummary[]
}

/** 열린 프로젝트의 요약. absolutePath는 기기 종속이라 렌더러는 표시용으로만 쓴다. */
export interface ProjectSummary {
  manifest: ProjectManifest
  absolutePath: string
  tree: TreeNode[]
}

/** 문서 하나의 전체 내용(프론트매터 + 본문). */
export interface DocContent {
  path: string
  frontmatter: Frontmatter
  body: string
}

/** 문서 저장 요청. */
export interface SaveDocRequest {
  path: string
  frontmatter: Frontmatter
  body: string
}

/** 자료 반입 결과 — 프로젝트 루트 기준 상대경로 목록(§6.10). */
export interface IngestResult {
  imported: string[]
  skipped: string[]
}

/** 자료 한 개(자료 갤러리·라이트박스용). path = 프로젝트 루트 기준 상대 POSIX. */
export interface AssetItem {
  path: string
  name: string
  kind: 'image' | 'video' | 'other'
}

// ── AI 어시스턴트(BLUEPRINT §7) ──

/** 프로바이더 계열. openai=OpenAI 호환(Ollama·LM Studio·OpenRouter 포함), cli=`claude -p` 등. */
export type AIProviderKind = 'openai' | 'anthropic' | 'cli'

export interface AIConfig {
  kind: AIProviderKind
  model: string
  /** OpenAI 호환 base URL (예: Ollama http://localhost:11434/v1). */
  baseUrl?: string
  /** CLI 실행 파일명 (claude/codex/gemini). */
  cliCommand?: string
  /** 렌더러 표시용 — 키 존재 여부만(키 값 자체는 절대 렌더러로 넘기지 않는다, §7.4). */
  hasKey?: boolean
}

export type AIErrorKind =
  | 'auth_expired'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'not_installed'
  | 'network'
  | 'cancelled'
  | 'other'

export interface AIConnStatus {
  ok: boolean
  state: 'ok' | 'auth' | 'limit' | 'missing' | 'error'
  detail: string
}

/**
 * AI에게 함께 보내는 자료 첨부(§7.5). 렌더러→main으로는 참조(kind·name·path)만 넘기고, main이
 * 생성 직전에 이미지 base64/PDF 텍스트를 채운다(dataBase64·text). 큰 데이터의 이중 IPC 전송을 피한다.
 */
export interface AIAttachment {
  kind: 'image' | 'text'
  name: string // 표시용 파일명
  path: string // 프로젝트 루트 기준 상대 POSIX 경로
  mediaType?: string // 이미지 MIME (image/png 등)
  dataBase64?: string // 이미지 원본 바이트(main이 채움)
  text?: string // PDF·텍스트 추출 결과(main이 채움)
}

/** 첨부 자료 요약(렌더러 칩·토큰 추정용) — 실제 데이터는 담지 않는다. */
export interface AIAttachmentInfo {
  kind: 'image' | 'text'
  name: string
  path: string
  mediaType?: string
  chars?: number // 텍스트/PDF 추출 글자수
  ok: boolean // AI가 실제로 활용 가능한지(이미지=항상, PDF=텍스트 있음)
  note: string // 사람이 읽는 상태 설명(예: "PDF · 약 3,200자")
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** 이 메시지에 딸린 자료 첨부(현재는 사용자 메시지에만). 참조만 담고 main이 데이터를 채운다. */
  attachments?: AIAttachment[]
}

/** 컨텍스트 빌더가 자동 포함한 항목 하나(칩 표시용, §7.2). */
export interface AIContextChip {
  label: string
  kind: 'scene' | 'character' | 'world' | 'synopsis' | 'asset'
}

/** 매 요청마다 조립되는 집필 맥락 — AI가 "항상 보는" 것. */
export interface AIContext {
  text: string
  chips: AIContextChip[]
  estTokens: number
}

/** 스트리밍 이벤트 페이로드(preload onAi* → 렌더러). */
export interface AIDelta {
  requestId: string
  text: string
}
export interface AIDone {
  requestId: string
  text: string
}
export interface AIErrorEvent {
  requestId: string
  kind: AIErrorKind
  message: string
}

/** IPC 표면. preload가 contextBridge로 window.api에 노출한다. */
export interface IceApi {
  // ── 서재(책장) ──
  getLibrary(): Promise<LibraryInfo>
  chooseLibraryDir(): Promise<LibraryInfo | null> // 폴더 선택 → 서재 경로 변경
  createBook(title: string): Promise<ProjectSummary>
  openBook(id: string): Promise<ProjectSummary>
  renameBook(id: string, newTitle: string): Promise<LibraryInfo>
  deleteBook(id: string): Promise<LibraryInfo>
  revealLibrary(): Promise<void>
  // ── 열린 책 ──
  refreshTree(): Promise<TreeNode[]>
  readDoc(path: string): Promise<DocContent>
  saveDoc(req: SaveDocRequest): Promise<void>
  createDoc(dir: string, type: DocType, title: string): Promise<TreeNode[]>
  createFolder(dir: string, name: string): Promise<TreeNode[]>
  trashEntry(path: string): Promise<TreeNode[]>
  renameEntry(path: string, newName: string): Promise<TreeNode[]>
  revealInOs(path: string): Promise<void>
  openProjectFolder(): Promise<void>
  zoomBy(delta: number): number
  zoomReset(): number
  ingestFiles(absolutePaths: string[], targetDir?: string): Promise<IngestResult>
  importAssets(): Promise<string[]> // 파일 선택창으로 이미지·자료 반입 → 반입된 상대경로
  listAssets(): Promise<AssetItem[]>
  assetUrl(relPath: string): string
  /** PDF를 Chromium 내장 뷰어 창으로 연다(§6.10). */
  openPdf(relPath: string): Promise<void>
  /** 레거시 ![[..]] 임베드를 표준 마크다운으로 일괄 변환(변환 전 스냅샷). 반환=바뀐 파일·임베드 수. */
  convertLegacyEmbeds(): Promise<{ files: number; embeds: number }>
  // ── AI ──
  buildAiContext(
    currentPath: string | null,
    currentBody: string,
    includeAssets?: boolean
  ): Promise<AIContext>
  /** 자료(이미지·PDF·텍스트)의 첨부 가능 여부·요약을 조사(칩·토큰 추정용). */
  aiAttachmentInfo(relPath: string): Promise<AIAttachmentInfo>
  listAiModels(
    draft: Pick<AIConfig, 'kind' | 'baseUrl' | 'cliCommand'>,
    apiKey?: string
  ): Promise<string[]>
  getAiConfig(): Promise<AIConfig>
  setAiConfig(cfg: AIConfig, apiKey?: string): Promise<AIConfig>
  checkAi(): Promise<AIConnStatus>
  aiGenerate(requestId: string, messages: ChatMessage[]): Promise<void>
  aiCancel(requestId: string): void
  onAiDelta(cb: (d: AIDelta) => void): () => void
  onAiDone(cb: (d: AIDone) => void): () => void
  onAiError(cb: (d: AIErrorEvent) => void): () => void
}
