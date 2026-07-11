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
import { getSelectionText } from '../lib/editorBridge'
import { pickAsset } from '../ui/picker'
import { useStore } from './store'

export const SYSTEM_PROMPT =
  '당신은 한국어 소설 집필을 돕는 조수입니다. 작가의 문체와 시점을 존중하고, 요청에 맞게 이어쓰거나 ' +
  '문장을 다듬습니다. 설명을 늘어놓지 말고 소설 본문에 바로 쓸 수 있는 결과를 제시하세요.\n\n' +
  '맥락에 "자료 폴더(참고 자료)"가 주어지면 그 문서 내용(설정 자료·조사 노트 등)을 근거로 활용하세요. ' +
  '목록에만 있고 내용이 없는 파일(이미지 등)은 필요하면 작가에게 첨부를 요청하세요.\n\n' +
  '이 원고는 표준 마크다운(.md)으로 저장됩니다. 마크다운 문법(제목 #, 굵게 **, 기울임 *, 인용 >, ' +
  '목록 -, 이미지 ![](경로))에 대해 물으면 정확히 안내하세요. 이미지·자료를 삽입할 때는 반드시 표준 ' +
  '문법 ![](상대경로)를 쓰고, 옛 방식 ![[..]]는 쓰지 마세요(다른 프로그램 호환).'

let seq = 0
const nextId = (): string => `req-${++seq}`

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
  context: AIContext | null // 지금 AI가 보고 있는 맥락(칩·토큰 표시용, §7.2)
  attachments: AIAttachmentInfo[] // AI에 함께 보낼 자료(이미지·PDF) — 스테이징(§7.5)
  activeRequestId: string | null
  lastPrompt: ChatMessage[] | null // 마지막으로 실제 전송한 메시지 전체(투명성 — "보낸 내용 보기")

  loadConfig: () => Promise<void>
  saveConfig: (cfg: AIConfig, apiKey?: string) => Promise<void>
  check: () => Promise<void>
  setIncludeContext: (v: boolean) => void
  setIncludeAssets: (v: boolean) => void
  refreshContext: () => Promise<void>
  addAttachment: () => Promise<void>
  removeAttachment: (path: string) => void
  send: (userText: string) => Promise<void>
  quickAction: (kind: 'continue' | 'revise') => void
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
  context: null,
  attachments: [],
  activeRequestId: null,
  lastPrompt: null,

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
      set({ context: await window.api.buildAiContext(st.activePath, st.body, get().includeAssets) })
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
        const ctx = await window.api.buildAiContext(st.activePath, st.body, get().includeAssets)
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
      lastPrompt: msgs // 실제 보낸 그대로 저장 → "보낸 내용 보기"로 검증
    }))
    void window.api.aiGenerate(id, msgs)
  },

  quickAction(kind) {
    if (get().streaming) return
    if (kind === 'continue') {
      void get().send('지금까지의 원고에 자연스럽게 이어서 3~5문단을 더 써 주세요. 문체와 흐름을 유지하세요.')
    } else {
      const sel = getSelectionText()
      if (!sel.trim()) {
        set({ error: '본문에서 다듬을 부분을 먼저 선택하세요.' })
        return
      }
      void get().send(`다음 부분의 문장을 다듬어 주세요. 의미는 유지하고 문체를 자연스럽게:\n\n${sel}`)
    }
  },

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
  if (d.requestId === s.activeRequestId) useAi.setState({ streamText: s.streamText + d.text })
})
window.api.onAiDone((d) => {
  const s = useAi.getState()
  if (d.requestId !== s.activeRequestId) return
  useAi.setState({
    messages: [...s.messages, { role: 'assistant', content: d.text || s.streamText }],
    streaming: false,
    streamText: '',
    activeRequestId: null
  })
})
window.api.onAiError((d) => {
  const s = useAi.getState()
  if (d.requestId !== s.activeRequestId) return
  if (d.kind === 'cancelled') {
    // 취소: 여태 받은 부분을 (부분) 답변으로 남긴다.
    useAi.setState({
      messages: s.streamText
        ? [...s.messages, { role: 'assistant', content: s.streamText + ' …(중지됨)' }]
        : s.messages,
      streaming: false,
      streamText: '',
      activeRequestId: null
    })
  } else {
    useAi.setState({ error: d.message, streaming: false, streamText: '', activeRequestId: null })
  }
})
