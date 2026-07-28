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
  | 'style' // 문체 지침·문체 참고 원고 (style/ — AI 하네스, §7.2a)
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
  /**
   * 이 문서의 표지(제목까지 얹은 완성본, 루트 기준 상대 POSIX). 챕터 표지 등 — 책 표지와 같은 방식(§7.6).
   * 갤러리 카드가 이 그림을 표지로 쓴다(images 첫 장보다 우선).
   */
  cover?: string
  /** 표지의 원본 아트(글자 없음). 제목만 다시 얹을 때 재생성 없이 재사용한다. */
  coverArt?: string
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
  /** 대표 이미지(프론트매터 images의 첫 장, 루트 기준 상대 POSIX) — 섹션 갤러리의 표지로 쓴다. */
  image?: string
  /** 문서 표지(프론트매터 cover) — 있으면 갤러리에서 image보다 먼저 쓴다. */
  cover?: string
  children?: TreeNode[]
}

/** 프로젝트(=책) 매니페스트 (icefiction.json). */
export interface ProjectManifest {
  schemaVersion: number
  title: string
  createdAt: string
  /** 최상위 섹션 표시 순서. */
  sections?: string[]
  /** 표지 이미지 파일명(책 폴더 루트 기준, 예: 'cover.png'). 없으면 기본 표지. 폴더와 함께 이동(§6.11). */
  cover?: string
  /** AI가 그린 표지 원본 아트(글자 없음, 예: 'cover-art.png'). 제목만 다시 얹을 때 재사용한다. */
  coverArt?: string
  /** 책장에서의 수동 정렬 순서(작을수록 앞). 없으면 최근 수정순으로 뒤에 붙는다. */
  order?: number
  /** 이미지 생성 스타일 바이블 — 이 책의 모든 그림이 같은 화풍을 갖게 한다(§7.6). */
  imageStyle?: string
}

/** 서재(책장)에 놓인 책 한 권의 요약. id = 서재 안 폴더명. */
export interface BookSummary {
  id: string // 서재 루트 기준 폴더명
  title: string
  updatedAt: string // ISO — 마지막 수정 시각(정렬용)
  chapterCount: number
  /** 표지가 있으면 바로 쓸 수 있는 ice-cover:// URL(캐시버스트 포함). 없으면 undefined → 기본 표지. */
  cover?: string
  /** 수동 정렬 순서(매니페스트 order). 렌더러 드래그 재정렬 표시용. */
  order?: number
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

// ── 책 전체 검색(BLUEPRINT §6.9) ──

/**
 * 매치 한 건. 위치(from/to·line)는 **본문(body) 기준** 문자 오프셋이다(프론트매터 제외) —
 * 에디터가 body만 표시하므로 그대로 selection에 쓸 수 있다.
 */
export interface SearchMatch {
  line: number // 1-시작 줄 번호(본문 기준)
  from: number
  to: number
  preview: string // 매치 주변 문맥(줄 안에서 클립)
  previewFrom: number // preview 안에서 매치 시작(하이라이트용)
  previewTo: number
}

/** 문서 하나의 검색 결과 묶음. */
export interface SearchFileResult {
  path: string // 프로젝트 루트 기준 상대 POSIX
  section: string // manuscript | characters | world | notes
  title: string
  titleMatch: boolean // 제목에도 걸렸는지(본문 위치가 없으므로 별도 플래그)
  matches: SearchMatch[]
  truncated: boolean // 파일당 상한으로 잘림
}

export interface SearchAllResult {
  files: SearchFileResult[]
  totalMatches: number
  truncated: boolean // 전체 상한으로 잘림
}

export interface SearchAllOptions {
  caseSensitive?: boolean
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
  /** 파일의 절대경로(main이 채움) — CLI 에이전트에게 "이 파일을 직접 열어 보라"고 알려 줄 때 쓴다(§7.5). */
  absPath?: string
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
  kind: 'scene' | 'character' | 'world' | 'synopsis' | 'asset' | 'style'
}

/** 매 요청마다 조립되는 집필 맥락 — AI가 "항상 보는" 것. */
export interface AIContext {
  text: string
  chips: AIContextChip[]
  estTokens: number
}

// ── 이미지 생성(BLUEPRINT §7.6) ──

/** 이미지 생성 CLI 엔진. 텍스트 AI 설정과 별개다. */
export type ImageEngine = 'agy' | 'codex' | 'gemini'

export interface ImageEngineInfo {
  engine: ImageEngine
  ok: boolean
  detail: string // 버전 또는 "없음" 사유
}

/** 그림을 어디에 붙일 것인가. */
export type ImageTarget =
  | { kind: 'doc'; path: string } // 문서(캐릭터·장소…) 첨부 이미지 → 프론트매터 images
  | { kind: 'cover'; bookId: string } // 책 표지 아트(글자 없음) → 제목은 앱이 얹는다
  | { kind: 'docCover'; path: string } // 문서(챕터) 표지 아트(글자 없음) → 제목은 앱이 얹는다
  | { kind: 'inline'; path: string } // 본문 삽화(/삽화) → 커서 자리에 ![](경로)로 삽입

export interface ImageGenRequest {
  requestId: string
  target: ImageTarget
  /** 장면 프롬프트(사용자가 모달에서 확인·수정한 최종본) */
  prompt: string
  /** 프로젝트 공통 스타일 바이블 */
  style?: string
  /** 화면 비율(§7.6) — 엔진이 못 맞추면 앱이 중앙 기준으로 잘라 맞춘다. */
  ratio: import('./imagePrompt').AspectRatio
  engine: ImageEngine | 'auto'
}

export interface ImageGenResult {
  requestId: string
  /** 문서 이미지: 프로젝트 루트 기준 상대 POSIX. 표지 아트: ice-cover URL로 볼 수 있는 파일명. */
  path: string
  /** 표지 아트를 렌더러가 캔버스로 읽을 수 있는 URL(제목 합성용). */
  url: string
  engine: ImageEngine
}

export interface ImageProgress {
  requestId: string
  text: string
}
export interface ImageErrorEvent {
  requestId: string
  message: string
  detail: string
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

// ── 업데이트 확인(BLUEPRINT §9.1) ──

/** GitHub 릴리스에 직접 물어본 결과. checked=false면 확인 자체가 실패한 것(조용히 넘긴다). */
export interface UpdateInfo {
  /** 확인이 실제로 성공했는가(네트워크·API 실패면 false). */
  checked: boolean
  hasUpdate: boolean
  current: string
  latest?: string
  /** 이 플랫폼에서 받을 파일의 직접 링크(없으면 릴리스 페이지). */
  url?: string
  pageUrl: string
  sizeBytes?: number
  date?: string
  notes?: string
}

/** IPC 표면. preload가 contextBridge로 window.api에 노출한다. */
export interface IceApi {
  /** 새 버전이 나왔는지 GitHub 릴리스에 직접 확인한다(§9.1). 실패해도 조용히 넘어간다. */
  checkUpdate(): Promise<UpdateInfo>
  /** 기본 브라우저로 다운로드 페이지·파일을 연다(앱이 직접 설치하지 않는다). */
  openExternal(url: string): Promise<void>
  /** 지금 실행 중인 앱 버전. */
  appVersion(): Promise<string>
  // ── 서재(책장) ──
  getLibrary(): Promise<LibraryInfo>
  chooseLibraryDir(): Promise<LibraryInfo | null> // 폴더 선택 → 서재 경로 변경
  createBook(title: string): Promise<ProjectSummary>
  openBook(id: string): Promise<ProjectSummary>
  renameBook(id: string, newTitle: string): Promise<LibraryInfo>
  deleteBook(id: string): Promise<LibraryInfo>
  /** 표지 지정/변경 — 이미지 선택창을 열어 책 폴더로 복사한다. 취소 시 변화 없음. */
  setBookCover(id: string): Promise<LibraryInfo>
  /** 표지를 이미지 데이터(base64 PNG)로 저장 — 앱이 제목을 얹어 합성한 표지를 넘긴다(§7.6). */
  setBookCoverData(id: string, base64Png: string): Promise<LibraryInfo>
  /** 표지 제거 — 표지 파일 삭제 + 매니페스트 cover 해제. */
  removeBookCover(id: string): Promise<LibraryInfo>
  /** 책 정보(제목·스타일 바이블·표지 아트) — 표지 생성 모달이 쓴다. */
  getBookMeta(id: string): Promise<{ title: string; imageStyle?: string; coverArtUrl?: string }>
  /** 이 책의 이미지 스타일 바이블 저장. */
  setBookImageStyle(id: string, style: string): Promise<void>
  /** 책장 수동 정렬 — 넘겨준 id 순서대로 각 책 매니페스트 order를 다시 매긴다. */
  reorderBooks(orderedIds: string[]): Promise<LibraryInfo>
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
  /** 문서 표지(제목까지 얹은 완성본)를 저장 — assets/covers/<문서명>.png. 반환 = 루트 기준 상대 경로. */
  saveDocCover(docPath: string, base64Png: string): Promise<string>
  /** 문서 표지·원본 아트 파일을 지운다(프론트매터 해제는 렌더러가 한다). */
  removeDocCover(docPath: string): Promise<void>
  /**
   * 표지 아트를 <canvas>로 읽을 수 있는 URL. **ice-asset이 아니라 ice-cover 스킴**을 쓴다 —
   * ice-asset은 corsEnabled가 없어 crossOrigin을 붙이면 로드가 깨지고, 안 붙이면 캔버스가
   * 오염돼 toDataURL()이 막힌다(§7.6 실측).
   */
  docCoverUrl(relPath: string, version?: number): string
  /** PDF를 Chromium 내장 뷰어 창으로 연다(§6.10). */
  openPdf(relPath: string): Promise<void>
  /** 레거시 ![[..]] 임베드를 표준 마크다운으로 일괄 변환(변환 전 스냅샷). 반환=바뀐 파일·임베드 수. */
  convertLegacyEmbeds(): Promise<{ files: number; embeds: number }>
  /** 책 전체 검색(§6.9) — 4개 섹션 .md의 제목+본문 부분일치. */
  searchAll(query: string, opts?: SearchAllOptions): Promise<SearchAllResult>
  // ── AI ──
  buildAiContext(
    currentPath: string | null,
    currentBody: string,
    includeAssets?: boolean,
    /** 문체 방(style/)을 하네스로 실을지 — 기본 켜짐(§7.2a). */
    includeStyle?: boolean
  ): Promise<AIContext>
  /** 자료(이미지·PDF·텍스트)의 첨부 가능 여부·요약을 조사(칩·토큰 추정용). */
  aiAttachmentInfo(relPath: string): Promise<AIAttachmentInfo>
  /** 열람 프로토콜(§7.5) — AI가 `[[열람: 경로]]`로 요청한 파일을 읽어 첨부로 돌려준다(최대 5개). */
  readAiFiles(paths: string[]): Promise<AIAttachment[]>
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
  // ── 이미지 생성(§7.6) ──
  /** 설치된 이미지 CLI 엔진 감지. */
  imageEngines(): Promise<ImageEngineInfo[]>
  /** 그림 생성 시작(스트리밍 진행 이벤트). 결과는 onImageDone. */
  generateImage(req: ImageGenRequest): Promise<void>
  cancelImage(requestId: string): void
  onImageProgress(cb: (d: ImageProgress) => void): () => void
  onImageDone(cb: (d: ImageGenResult) => void): () => void
  onImageError(cb: (d: ImageErrorEvent) => void): () => void
}
