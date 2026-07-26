/**
 * AI 어시스턴트 상태(BLUEPRINT §7) — 프로바이더 설정·연결·채팅·스트리밍.
 * 컨텍스트는 현재 문서를 자동 포함(칩으로 토글). AI 결과는 사용자가 명시적으로 본문에 삽입한다(§7.4).
 */
import { create } from 'zustand'
import type {
  AIAttachment,
  AIAttachmentInfo,
  AIConfig,
  AIConnStatus,
  AIContext,
  ChatMessage
} from '../../../shared/types'
import { buildStyleAnalysisPrompt, type StyleSample } from '../../../shared/stylePrompt'
import { getSelectionText } from '../lib/editorBridge'
import { appendGhost, clearGhost, showGhost } from '../lib/ghostText'
import type { SlashCommand, SlashContext, SlashKind } from '../../../shared/slashCommands'
import { parseOpenRequests, stripOpenRequests } from '../../../shared/openRequest'
import { openConfirm } from '../ui/dialogs'
import { pickAsset } from '../ui/picker'
import { useStore } from './store'

/** 문체 방 경로(§7.2a) — main의 STYLE_DIR과 짝을 이룬다. */
export const STYLE_GUIDE_PATH = 'style/문체지침.md'
const STYLE_SAMPLES_DIR = 'style/samples'

/**
 * 열람 자동 왕복 횟수 상한(§7.5) — AI가 파일을 요청하면 앱이 읽어 다시 물어보는 것을 최대 3번까지.
 * 상한이 없으면 "요청 → 읽기 → 또 요청"이 끝없이 돌 수 있다.
 */
const MAX_OPEN_ROUNDS = 3

export const SYSTEM_PROMPT =
  '당신은 한국어 소설 집필을 돕는 조수입니다. 작가의 문체와 시점을 존중하고, 요청에 맞게 이어쓰거나 ' +
  '문장을 다듬습니다. 설명을 늘어놓지 말고 소설 본문에 바로 쓸 수 있는 결과를 제시하세요.\n\n' +
  '맥락에 "문체 지침"이 있으면 그것이 최우선입니다 — 다른 어떤 요청보다 문체 지침을 먼저 지키세요. ' +
  '"문체 참고"로 주어진 글은 문장 길이·어미·리듬·대사 처리 같은 **문체만** 따르고, 그 글의 줄거리· ' +
  '인물·설정은 절대 가져오지 마세요.\n\n' +
  '맥락 끝에는 "프로젝트 전체 목차"가 있습니다 — 소설 폴더 안의 모든 파일이 거기 있습니다(✓는 이미 ' +
  '내용이 실린 것). 어떤 파일의 내용이 필요한데 맥락에 없으면 **추측하지 말고**, 답변 대신 ' +
  '`[[열람: 경로]]` 줄만 출력하세요(한 번에 최대 5개). 앱이 그 파일을 읽어 곧바로 다시 물어봅니다. ' +
  '이미지도 같은 방법으로 열어 볼 수 있습니다. 목차에 없는 파일은 존재하지 않는 파일입니다.\n\n' +
  '이 원고는 표준 마크다운(.md)으로 저장됩니다. 마크다운 문법(제목 #, 굵게 **, 기울임 *, 인용 >, ' +
  '목록 -, 이미지 ![](경로))에 대해 물으면 정확히 안내하세요. 이미지·자료를 삽입할 때는 반드시 표준 ' +
  '문법 ![](상대경로)를 쓰고, 옛 방식 ![[..]]는 쓰지 마세요(다른 프로그램 호환).'

let seq = 0
const nextId = (): string => `req-${++seq}`

/**
 * 요청문 **끝**에 붙이는 문체 재확인(샌드위치).
 * 맥락이 길어지면 모델이 맨 앞의 지침을 흘려보내므로, 실제 지시 바로 옆에서 한 번 더 못박는다.
 * 문체 방이 비었거나 토글이 꺼져 있으면 붙이지 않는다(없는 규칙을 지키라고 하면 혼란만 준다).
 */
export function styleTail(): string {
  const s = useAi.getState()
  const has = s.includeContext && s.includeStyle && !!s.context?.chips.some((c) => c.kind === 'style')
  return has ? '\n\n(맥락 맨 앞의 문체 지침을 그대로 지킬 것.)' : ''
}

interface AiState {
  config: AIConfig | null
  conn: AIConnStatus | null
  checking: boolean
  messages: ChatMessage[] // 표시용 채팅(user/assistant)
  streaming: boolean
  streamText: string
  error: string | null
  includeContext: boolean
  includeAssets: boolean // 자료 폴더를 AI가 스스로 훑어 읽을지(§7.5) — 기본 켜짐
  includeStyle: boolean // 문체 방(style/)을 하네스로 실을지(§7.2a) — 기본 켜짐
  context: AIContext | null // 지금 AI가 보고 있는 맥락(칩·토큰 표시용, §7.2)
  attachments: AIAttachmentInfo[] // AI에 함께 보낼 자료(이미지·PDF) — 스테이징(§7.5)
  activeRequestId: string | null
  lastPrompt: ChatMessage[] | null // 마지막으로 실제 전송한 메시지 전체(투명성 — "보낸 내용 보기")
  /** 지금 스트리밍 중인 응답이 문체지침 초안인가 — 끝나면 style/문체지침.md 저장을 제안한다. */
  pendingStyleGuide: boolean
  /** 지금 진행 중인 슬래시 명령(§6.1b) — 있으면 델타를 채팅이 아니라 고스트로 보낸다. */
  inline: { kind: SlashKind; label: string; from: number; to: number } | null
  /**
   * 슬래시 명령이 사용자에게 바로 해야 할 말(실패·안내). AI 패널이 닫혀 있어도 보이도록
   * 본문 위 안내 막대에 띄운다 — 패널의 `error`와 달리 "쓰던 자리"에 뜬다.
   */
  inlineNotice: string | null
  /** 이번 턴에 이미 돈 열람 왕복 횟수(§7.5) — 새 요청마다 0으로 돌아간다. */
  openRounds: number
  /** 지금 읽고 있는 파일들(스피너 옆 표시용). */
  openingFiles: string[]

  loadConfig: () => Promise<void>
  saveConfig: (cfg: AIConfig, apiKey?: string) => Promise<void>
  check: () => Promise<void>
  setIncludeContext: (v: boolean) => void
  setIncludeAssets: (v: boolean) => void
  setIncludeStyle: (v: boolean) => void
  refreshContext: () => Promise<void>
  addAttachment: () => Promise<void>
  removeAttachment: (path: string) => void
  send: (userText: string) => Promise<void>
  quickAction: (kind: 'continue' | 'revise') => void
  /** style/samples/의 원고에서 문체지침 초안을 뽑아 style/문체지침.md에 저장(§7.2a). */
  analyzeStyle: () => Promise<void>
  /** 본문 슬래시 명령(§6.1b) — 결과를 채팅이 아니라 커서 자리 고스트/문서 정보로 흘린다. */
  runInline: (cmd: SlashCommand, ctx: SlashContext, range: { from: number; to: number }) => Promise<void>
  /** 본문 위 안내 막대에 한마디(null이면 지움). */
  notify: (msg: string | null) => void
  cancel: () => void
  clearChat: () => void
}

function buildMessages(
  userText: string,
  contextText: string,
  prior: ChatMessage[],
  attachments: AIAttachment[]
): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  if (contextText) {
    out.push({ role: 'user', content: contextText })
    out.push({ role: 'assistant', content: '네, 이 맥락(등장인물·설정·흐름)을 지키며 돕겠습니다.' })
  }
  const userMsg: ChatMessage = { role: 'user', content: userText }
  if (attachments.length > 0) userMsg.attachments = attachments
  out.push(...prior, userMsg)
  return out
}

export const useAi = create<AiState>((set, get) => ({
  config: null,
  conn: null,
  checking: false,
  messages: [],
  streaming: false,
  streamText: '',
  error: null,
  includeContext: true,
  includeAssets: true,
  includeStyle: true,
  context: null,
  attachments: [],
  activeRequestId: null,
  lastPrompt: null,
  pendingStyleGuide: false,
  inline: null,
  inlineNotice: null,
  openRounds: 0,
  openingFiles: [],

  async loadConfig() {
    set({ config: await window.api.getAiConfig() })
  },

  async saveConfig(cfg, apiKey) {
    const saved = await window.api.setAiConfig(cfg, apiKey)
    set({ config: saved, conn: null })
  },

  async check() {
    set({ checking: true })
    try {
      set({ conn: await window.api.checkAi() })
    } finally {
      set({ checking: false })
    }
  },

  setIncludeContext: (v) => {
    set({ includeContext: v })
    void get().refreshContext()
  },

  setIncludeAssets: (v) => {
    set({ includeAssets: v })
    void get().refreshContext()
  },

  setIncludeStyle: (v) => {
    set({ includeStyle: v })
    void get().refreshContext()
  },

  async refreshContext() {
    if (!get().includeContext) {
      set({ context: null })
      return
    }
    const st = useStore.getState()
    if (!st.project) {
      set({ context: null })
      return
    }
    try {
      set({
        context: await window.api.buildAiContext(
          st.activePath,
          st.body,
          get().includeAssets,
          get().includeStyle
        )
      })
    } catch {
      /* 컨텍스트 조립 실패는 무시(대화는 계속 가능) */
    }
  },

  async addAttachment() {
    const path = await pickAsset('attach')
    if (!path) return
    if (get().attachments.some((a) => a.path === path)) return // 중복 방지
    try {
      const info = await window.api.aiAttachmentInfo(path)
      set((s) => ({ attachments: [...s.attachments, info] }))
    } catch {
      /* 조사 실패는 무시 */
    }
  },

  removeAttachment(path) {
    set((s) => ({ attachments: s.attachments.filter((a) => a.path !== path) }))
  },

  async send(userText) {
    const text = userText.trim()
    if (!text || get().streaming) return
    const id = nextId()
    // 매 요청마다 지금 원고를 새로 읽어 맥락을 조립한다("항상 보는" 핵심, §7.2).
    let contextText = ''
    if (get().includeContext) {
      const st = useStore.getState()
      try {
        const ctx = await window.api.buildAiContext(
          st.activePath,
          st.body,
          get().includeAssets,
          get().includeStyle
        )
        contextText = ctx.text
        set({ context: ctx })
      } catch {
        /* 실패해도 대화는 진행 */
      }
    }
    // 스테이징된 자료 중 실제 활용 가능한 것만 참조로 첨부(데이터는 main이 채운다, §7.5).
    const refs: AIAttachment[] = get()
      .attachments.filter((a) => a.ok)
      .map((a) => ({ kind: a.kind, name: a.name, path: a.path }))
    const msgs = buildMessages(text, contextText, get().messages, refs)
    set((s) => ({
      messages: [...s.messages, { role: 'user', content: text }],
      streaming: true,
      streamText: '',
      error: null,
      activeRequestId: id,
      lastPrompt: msgs, // 실제 보낸 그대로 저장 → "보낸 내용 보기"로 검증
      openRounds: 0,
      openingFiles: []
    }))
    void window.api.aiGenerate(id, msgs)
  },

  quickAction(kind) {
    if (get().streaming) return
    if (kind === 'continue') {
      void get().send(
        '지금까지의 원고에 자연스럽게 이어서 3~5문단을 더 써 주세요. 문체와 흐름을 유지하세요.' +
          styleTail()
      )
    } else {
      const sel = getSelectionText()
      if (!sel.trim()) {
        set({ error: '본문에서 다듬을 부분을 먼저 선택하세요.' })
        return
      }
      void get().send(
        `다음 부분의 문장을 다듬어 주세요. 의미는 유지하고 문체를 자연스럽게:\n\n${sel}${styleTail()}`
      )
    }
  },

  /**
   * 문체 분석 — style/samples/의 원고를 읽어 '문체지침' 초안을 만든다.
   *
   * 맥락(원고·자료·기존 문체)은 **일부러 싣지 않는다**: 지금 만들려는 것이 바로 그 문체 지침이라,
   * 옛 지침을 함께 보내면 그것을 베껴 오기 때문이다. 결과는 대화에 남고, 저장은 확인을 받는다.
   */
  async analyzeStyle() {
    if (get().streaming) return
    const tree = useStore.getState().tree
    const paths: string[] = []
    const walk = (nodes: typeof tree): void => {
      for (const n of nodes) {
        if (n.isDir) walk(n.children ?? [])
        else if (n.path.startsWith(`${STYLE_SAMPLES_DIR}/`)) paths.push(n.path)
      }
    }
    walk(tree)
    if (paths.length === 0) {
      set({
        error: `문체 참고 원고가 없습니다 — 바인더의 [문체] > samples 폴더에 기존 원고를 .md로 넣어 주세요.`
      })
      return
    }

    const samples: StyleSample[] = []
    for (const path of paths) {
      try {
        const doc = await window.api.readDoc(path)
        if (doc.body.trim()) samples.push({ name: path.split('/').pop() ?? path, text: doc.body })
      } catch {
        /* 읽기 실패한 샘플은 건너뛴다 */
      }
    }
    if (samples.length === 0) {
      set({ error: 'samples 폴더의 원고가 모두 비어 있습니다.' })
      return
    }

    const id = nextId()
    const prompt = buildStyleAnalysisPrompt(samples)
    const msgs: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ]
    set((s) => ({
      messages: [...s.messages, { role: 'user', content: `문체 분석 — 참고 원고 ${samples.length}편` }],
      streaming: true,
      streamText: '',
      error: null,
      activeRequestId: id,
      lastPrompt: msgs,
      pendingStyleGuide: true,
      openRounds: 0,
      openingFiles: []
    }))
    void window.api.aiGenerate(id, msgs)
  },

  /**
   * 슬래시 명령 실행(§6.1b) — 맥락(문체·원고·자료)은 채팅과 똑같이 싣되,
   * 결과는 채팅에 쌓지 않고 커서 자리로 돌려준다. 대화 흐름을 어지럽히지 않기 위해서다.
   */
  async runInline(cmd, ctx, range) {
    if (get().streaming || !cmd.build) return
    let contextText = ''
    if (get().includeContext) {
      const st = useStore.getState()
      try {
        const c = await window.api.buildAiContext(
          st.activePath,
          st.body,
          get().includeAssets,
          get().includeStyle
        )
        contextText = c.text
        set({ context: c })
      } catch {
        /* 맥락 실패해도 명령은 진행 */
      }
    }
    const id = nextId()
    const msgs = buildMessages(cmd.build(ctx) + styleTail(), contextText, [], [])
    // 첫 글자가 오기 전에 흐린 자리부터 띄운다 — 부른 즉시 "쓰는 중"이 보여야 한다(§6.1a).
    if (cmd.kind === 'ghost') {
      showGhost({ from: range.from, to: range.to, status: 'streaming', label: cmd.label })
    }
    set({
      streaming: true,
      streamText: '',
      error: null,
      inlineNotice: cmd.kind === 'synopsis' ? `${cmd.label} — 줄거리를 뽑는 중…` : null,
      activeRequestId: id,
      lastPrompt: msgs,
      inline: { kind: cmd.kind, label: cmd.label, ...range },
      openRounds: 0,
      openingFiles: []
    })
    void window.api.aiGenerate(id, msgs)
  },

  notify: (msg) => set({ inlineNotice: msg }),

  cancel() {
    const id = get().activeRequestId
    if (id) window.api.aiCancel(id)
    // 실제 종료는 ai:error(cancelled) 이벤트가 마무리한다.
  },

  clearChat: () => set({ messages: [], streamText: '', error: null })
}))

// 스트리밍 이벤트 라우팅(요청ID로 현재 요청만 반영).
window.api.onAiDelta((d) => {
  const s = useAi.getState()
  if (d.requestId !== s.activeRequestId) return
  // 슬래시 명령의 결과는 채팅이 아니라 커서 자리에 흐린 글씨로 실시간으로 쌓인다(§6.1a).
  if (s.inline?.kind === 'ghost') appendGhost(d.text)
  useAi.setState({ streamText: s.streamText + d.text })
})
window.api.onAiDone((d) => {
  const s = useAi.getState()
  if (d.requestId !== s.activeRequestId) return
  const text = d.text || s.streamText

  // 슬래시 명령(§6.1b): 결과는 채팅에 남기지 않는다.
  if (s.inline) {
    finishInline(s.inline, text)
    useAi.setState({
      streaming: false,
      streamText: '',
      activeRequestId: null,
      inline: null
    })
    return
  }

  // 열람 프로토콜(§7.5): AI가 파일을 요청했으면 앱이 읽어서 자동으로 한 번 더 물어본다.
  const requests = parseOpenRequests(text)
  const willOpen = requests.length > 0 && s.openRounds < MAX_OPEN_ROUNDS && !s.pendingStyleGuide
  const visible = willOpen ? stripOpenRequests(text) : text

  useAi.setState({
    messages: visible.trim()
      ? [...s.messages, { role: 'assistant', content: visible }]
      : s.messages,
    streaming: willOpen, // 이어서 자동 재요청하므로 스피너를 유지한다
    streamText: '',
    activeRequestId: null,
    pendingStyleGuide: false,
    openingFiles: willOpen ? requests : []
  })

  if (willOpen) void openAndContinue(text, requests)
  else if (s.pendingStyleGuide && text.trim()) void saveStyleGuide(text)
})

/**
 * 요청받은 파일을 읽어 대화에 붙이고 같은 턴을 이어 간다(§7.5).
 * 직전 요청(lastPrompt)에 assistant의 요청과 [열람 결과]를 덧붙여 보내므로 맥락이 끊기지 않는다.
 */
async function openAndContinue(assistantText: string, paths: string[]): Promise<void> {
  const s = useAi.getState()
  let files: AIAttachment[] = []
  try {
    files = await window.api.readAiFiles(paths)
  } catch (e) {
    useAi.setState({
      error: `파일을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`,
      streaming: false,
      openingFiles: []
    })
    return
  }

  // 텍스트는 본문 그대로, 이미지는 참조만(데이터는 main이 생성 직전에 채운다 §7.5).
  const summary = files
    .map((f) => (f.kind === 'image' ? `${f.path} (이미지 — 아래에 첨부)` : `${f.path}`))
    .join('\n')
  const bodies = files
    .filter((f) => f.kind === 'text' && f.text)
    .map((f) => `### ${f.path}\n${f.text}`)
    .join('\n\n')

  const wire: ChatMessage[] = [
    ...(s.lastPrompt ?? []),
    { role: 'assistant', content: assistantText },
    {
      role: 'user',
      content: `[열람 결과] 요청한 파일입니다.\n${summary}\n\n${bodies}\n\n이 내용을 바탕으로 이어서 답하세요. 더 필요하면 다시 [[열람: 경로]]로 요청해도 됩니다.`,
      attachments: files.filter((f) => f.kind === 'image')
    }
  ]
  const id = nextId()
  useAi.setState((st) => ({
    messages: [...st.messages, { role: 'user', content: `📖 열람: ${paths.join(', ')}` }],
    streaming: true,
    streamText: '',
    activeRequestId: id,
    lastPrompt: wire,
    openRounds: st.openRounds + 1,
    openingFiles: []
  }))
  void window.api.aiGenerate(id, wire)
}

/**
 * 슬래시 명령 마무리 — 종류에 따라 결과가 가는 곳이 다르다.
 *  · ghost    커서 자리에 흐린 글씨로(이미 스트리밍으로 쌓였다). Tab을 눌러야 원고에 들어간다.
 *  · synopsis 문서 정보(프론트매터 줄거리)에 바로 넣는다 — 본문을 건드리지 않으므로 안전하다.
 */
function finishInline(
  inline: { kind: SlashKind; label: string; from: number; to: number },
  text: string
): void {
  if (inline.kind === 'synopsis') {
    const line = unfence(text).split('\n')[0]?.trim().replace(/^["'「『]|["'」』]$/g, '') ?? ''
    if (line) useStore.getState().setFrontmatter({ synopsis: line })
    // 본문이 그대로라 화면에 아무 변화가 없다 — 어디로 갔는지 말해 준다(오른쪽 '문서 정보').
    useAi.setState({
      inlineNotice: line ? `줄거리를 문서 정보에 넣었습니다 — “${line}”` : '줄거리를 받지 못했습니다.'
    })
    return
  }
  // ghost — 스트리밍 중 델타가 이미 쌓였다. 델타 없이 최종 텍스트만 주는 프로바이더(codex 등)도 있으므로
  // 마지막에 최종본으로 한 번 맞춘다. 비었으면 흐린 글씨를 지운다(빈 제안이 남지 않게).
  const cur = text.trim()
  if (cur) {
    showGhost({ from: inline.from, to: inline.to, text: cur, status: 'ready', label: inline.label })
  } else {
    clearGhost()
    useAi.setState({ inlineNotice: `${inline.label} — 결과가 비어 있습니다. 다시 실행해 보세요.` })
  }
}

/** 모델이 지시를 어기고 ```markdown 펜스로 감쌌을 때를 벗겨 낸다(그대로 파일이 되므로). */
function unfence(text: string): string {
  const m = text.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/)
  return (m ? m[1] : text).trim()
}

/** 문체지침 초안을 style/문체지침.md에 저장 — 덮어쓰기 전에 반드시 확인을 받는다. */
async function saveStyleGuide(draft: string): Promise<void> {
  const body = unfence(draft)
  const ok = await openConfirm({
    title: '문체지침으로 저장',
    message: `이 초안을 ${STYLE_GUIDE_PATH}에 저장합니다. 기존 지침은 덮어써집니다.`,
    confirmLabel: '저장'
  })
  if (!ok) return
  try {
    await window.api.saveDoc({
      path: STYLE_GUIDE_PATH,
      frontmatter: { type: 'style', title: '문체지침' },
      body: body + '\n'
    })
    await useStore.getState().refreshTree()
    await useAi.getState().refreshContext()
  } catch (e) {
    useAi.setState({ error: `문체지침 저장 실패: ${e instanceof Error ? e.message : String(e)}` })
  }
}
window.api.onAiError((d) => {
  const s = useAi.getState()
  if (d.requestId !== s.activeRequestId) return

  // 슬래시 명령은 채팅에 흔적을 남기지 않는다. 중지하면 흐린 글씨도 함께 걷어낸다.
  if (s.inline) {
    if (s.inline.kind === 'ghost' && d.kind === 'cancelled' && s.streamText.trim()) {
      // 중지 시점까지 받은 것은 남겨 둔다 — 그대로 Tab으로 확정할 수 있다.
      showGhost({
        from: s.inline.from,
        to: s.inline.to,
        text: s.streamText.trim(),
        status: 'ready',
        label: s.inline.label
      })
    } else if (s.inline.kind === 'ghost') {
      clearGhost()
    }
    useAi.setState({
      error: d.kind === 'cancelled' ? null : d.message,
      // 패널이 닫혀 있어도 실패를 알 수 있게 쓰던 자리에도 띄운다.
      inlineNotice: d.kind === 'cancelled' ? null : `${s.inline.label} 실패 — ${d.message}`,
      streaming: false,
      streamText: '',
      activeRequestId: null,
      inline: null
    })
    return
  }

  if (d.kind === 'cancelled') {
    // 취소: 여태 받은 부분을 (부분) 답변으로 남긴다.
    useAi.setState({
      messages: s.streamText
        ? [...s.messages, { role: 'assistant', content: s.streamText + ' …(중지됨)' }]
        : s.messages,
      streaming: false,
      streamText: '',
      activeRequestId: null,
      pendingStyleGuide: false
    })
  } else {
    useAi.setState({
      error: d.message,
      streaming: false,
      streamText: '',
      activeRequestId: null,
      pendingStyleGuide: false
    })
  }
})
