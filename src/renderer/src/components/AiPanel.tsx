/**
 * AI 어시스턴트 패널(BLUEPRINT §7.3) — 프로바이더 설정 + 연결확인 + 채팅(스트리밍) + 빠른 액션.
 * AI 결과는 '본문에 넣기'로 사용자가 명시적으로 삽입한다(원고 직접수정 금지 §7.4).
 */
import { useEffect, useRef, useState } from 'react'
import type { AIProviderKind, ChatMessage } from '../../../shared/types'
import { insertOrReplace } from '../lib/editorBridge'
import { SYSTEM_PROMPT, useAi } from '../state/ai'
import { useStore } from '../state/store'

const KIND_LABEL: Record<AIProviderKind, string> = {
  openai: 'OpenAI 호환 / 로컬(Ollama)',
  anthropic: 'Claude API',
  cli: 'CLI 에이전트 (claude · codex)'
}

const ROLE_LABEL: Record<ChatMessage['role'], string> = {
  system: '시스템 지시',
  user: '사용자 · 맥락',
  assistant: 'AI'
}

/**
 * "AI에게 보낸 내용 보기" — AI가 실제로 무엇을 받았는지(원고·설정·흐름 포함) 그대로 보여준다.
 * 아직 보낸 적이 없으면 다음 전송에 들어갈 맥락을 미리 보여준다("정말 내 작품을 보고 있나" 해소).
 */
function PromptViewer({ onClose }: { onClose: () => void }): React.ReactElement {
  const lastPrompt = useAi((s) => s.lastPrompt)
  const context = useAi((s) => s.context)
  const includeContext = useAi((s) => s.includeContext)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const preview: ChatMessage[] = lastPrompt ?? [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(includeContext && context?.text
      ? [{ role: 'user' as const, content: context.text }]
      : [])
  ]

  const totalChars = preview.reduce((n, m) => n + Array.from(m.content).length, 0)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="promptview">
        <div className="promptview-head">
          <span>
            {lastPrompt ? 'AI에게 보낸 내용(마지막 요청)' : 'AI에게 보낼 내용(미리보기)'} · 약{' '}
            {totalChars.toLocaleString('ko')}자
          </span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="promptview-body">
          {preview.length === 0 ? (
            <div className="promptview-empty">아직 맥락이 없습니다. 문서를 열고 대화를 시작하세요.</div>
          ) : (
            preview.map((m, i) => (
              <div key={i} className={`promptview-msg role-${m.role}`}>
                <div className="promptview-role">{ROLE_LABEL[m.role]}</div>
                <pre className="promptview-content">{m.content}</pre>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="promptview-atts">
                    {m.attachments.map((a) => (
                      <span key={a.path} className="promptview-att">
                        {a.kind === 'image' ? '🖼' : '📄'} {a.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function Setup(): React.ReactElement {
  const config = useAi((s) => s.config)
  const conn = useAi((s) => s.conn)
  const checking = useAi((s) => s.checking)
  const saveConfig = useAi((s) => s.saveConfig)
  const check = useAi((s) => s.check)

  const [kind, setKind] = useState<AIProviderKind>(config?.kind ?? 'openai')
  const [model, setModel] = useState(config?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? 'http://localhost:11434/v1')
  const [cliCommand, setCliCommand] = useState(config?.cliCommand ?? 'claude')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [manual, setManual] = useState(false)

  async function fetchModels(): Promise<void> {
    setLoadingModels(true)
    try {
      const list = await window.api.listAiModels({ kind, baseUrl, cliCommand }, apiKey || undefined)
      setModels(list)
      // 현재 모델이 목록에 없으면: CLI는 기본('')으로(다른 CLI 별칭 잔존 방지), 그 외는 첫 모델로.
      if (list.length > 0 && !list.includes(model)) setModel(kind === 'cli' ? '' : list[0])
    } finally {
      setLoadingModels(false)
    }
  }

  // 프로바이더나 CLI 실행 명령(claude↔codex)이 바뀌면 모델 목록을 다시 불러온다(드롭다운 자동 채움).
  useEffect(() => {
    void fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, cliCommand])

  const modelOptions = [...new Set([model, ...models].filter(Boolean))]

  async function onSave(): Promise<void> {
    await saveConfig({ kind, model, baseUrl, cliCommand }, apiKey ? apiKey : undefined)
    setApiKey('')
    await check()
  }

  return (
    <div className="ai-setup">
      <label className="ai-field">
        <span>프로바이더</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as AIProviderKind)}>
          {(Object.keys(KIND_LABEL) as AIProviderKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      {kind === 'openai' && (
        <label className="ai-field">
          <span>Base URL</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
        </label>
      )}
      {kind === 'cli' && (
        <label className="ai-field">
          <span>CLI 선택</span>
          <select value={cliCommand} onChange={(e) => setCliCommand(e.target.value)}>
            {[...new Set(['claude', 'codex', cliCommand].filter(Boolean))].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="ai-hint-sm">
            {cliCommand.toLowerCase().includes('codex')
              ? "codex는 먼저 터미널에서 'codex login' 필요"
              : "claude는 'claude login', codex는 'codex login'으로 미리 로그인"}
          </span>
        </label>
      )}

      <div className="ai-field">
        <span>
          모델
          {models.length === 0 && !loadingModels && ' — 불러오기(⟳)를 눌러 목록을 받으세요'}
        </span>
        <div className="ai-model-row">
          {manual || modelOptions.length === 0 ? (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={kind === 'anthropic' ? 'claude-...' : kind === 'openai' ? 'llama3.1' : '(선택)'}
            />
          ) : (
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {kind === 'cli' && <option value="">(CLI 기본 모델)</option>}
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => void fetchModels()} disabled={loadingModels} title="모델 목록 불러오기">
            {loadingModels ? '…' : '⟳'}
          </button>
          {modelOptions.length > 0 && (
            <button onClick={() => setManual((v) => !v)} title="목록/직접 입력 전환">
              {manual ? '목록' : '직접'}
            </button>
          )}
        </div>
      </div>

      {(kind === 'anthropic' || kind === 'openai') && (
        <label className="ai-field">
          <span>API 키 {config?.hasKey ? '(저장됨 — 바꿀 때만 입력)' : kind === 'openai' ? '(로컬은 불필요)' : ''}</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.hasKey ? '••••••••' : 'sk-...'}
          />
        </label>
      )}

      <div className="ai-setup-actions">
        <button className="ai-save" onClick={() => void onSave()}>
          저장 + 연결 확인
        </button>
        <button onClick={() => void check()} disabled={checking}>
          {checking ? '확인 중…' : '연결 확인'}
        </button>
      </div>
      {conn && (
        <div className={`ai-conn ai-conn-${conn.state}`}>
          {conn.ok ? '● ' : '○ '}
          {conn.detail}
        </div>
      )}
    </div>
  )
}

export function AiPanel(): React.ReactElement {
  const config = useAi((s) => s.config)
  const conn = useAi((s) => s.conn)
  const messages = useAi((s) => s.messages)
  const streaming = useAi((s) => s.streaming)
  const streamText = useAi((s) => s.streamText)
  const openingFiles = useAi((s) => s.openingFiles)
  const error = useAi((s) => s.error)
  const includeContext = useAi((s) => s.includeContext)
  const includeAssets = useAi((s) => s.includeAssets)
  const includeStyle = useAi((s) => s.includeStyle)
  const context = useAi((s) => s.context)
  const attachments = useAi((s) => s.attachments)
  const refreshContext = useAi((s) => s.refreshContext)
  const loadConfig = useAi((s) => s.loadConfig)
  const addAttachment = useAi((s) => s.addAttachment)
  const removeAttachment = useAi((s) => s.removeAttachment)
  const send = useAi((s) => s.send)
  const quickAction = useAi((s) => s.quickAction)
  const analyzeStyle = useAi((s) => s.analyzeStyle)
  const cancel = useAi((s) => s.cancel)
  const clearChat = useAi((s) => s.clearChat)
  const setIncludeContext = useAi((s) => s.setIncludeContext)
  const setIncludeAssets = useAi((s) => s.setIncludeAssets)
  const setIncludeStyle = useAi((s) => s.setIncludeStyle)

  // 지금 원고를 반영해 맥락 칩을 라이브로 갱신(디바운스) — "AI가 항상 보는" 것을 눈에 보이게.
  const activePath = useStore((s) => s.activePath)
  const body = useStore((s) => s.body)

  const [input, setInput] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!config) void loadConfig()
  }, [config, loadConfig])

  useEffect(() => {
    const t = setTimeout(() => void refreshContext(), 600)
    return () => clearTimeout(t)
  }, [activePath, body, includeContext, includeAssets, includeStyle, refreshContext])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streamText])

  const connected = conn?.ok
  const setupOpen = showSetup || !connected

  function onSend(): void {
    if (!input.trim()) return
    send(input)
    setInput('')
  }

  return (
    <div className="ai">
      <div className="ai-head">
        <span className="ai-title">
          AI 조수
          {conn && (
            <span className={`ai-dot ai-dot-${conn.state}`} title={conn.detail}>
              ●
            </span>
          )}
        </span>
        <div className="ai-head-tools">
          <button onClick={() => setShowPrompt(true)} title="AI에게 보낸(보낼) 내용 보기">
            🔍
          </button>
          <button onClick={() => clearChat()} title="대화 비우기">
            🗑
          </button>
          <button className={setupOpen ? 'active' : ''} onClick={() => setShowSetup((v) => !v)} title="설정">
            ⚙
          </button>
        </div>
      </div>

      {setupOpen && <Setup />}
      {showPrompt && <PromptViewer onClose={() => setShowPrompt(false)} />}

      <div className="ai-chips">
        <button
          className={`ai-chip toggle${includeContext ? ' on' : ''}`}
          onClick={() => setIncludeContext(!includeContext)}
          title="원고·설정 맥락을 매 요청마다 자동 포함"
        >
          {includeContext ? '👁 원고 보는 중' : '○ 맥락 끔'}
        </button>
        {includeContext && (
          <button
            className={`ai-chip toggle${includeAssets ? ' on' : ''}`}
            onClick={() => setIncludeAssets(!includeAssets)}
            title="자료 폴더의 문서(PDF·메모)를 AI가 스스로 훑어 읽습니다"
          >
            {includeAssets ? '📂 자료 읽는 중' : '○ 자료 끔'}
          </button>
        )}
        {includeContext && (
          <button
            className={`ai-chip toggle${includeStyle ? ' on' : ''}`}
            onClick={() => setIncludeStyle(!includeStyle)}
            title="문체 방(style/)의 지침·참고 원고를 매 요청 맨 앞에 실어 그 문체로만 쓰게 합니다"
          >
            {includeStyle ? '✍ 문체 지키는 중' : '○ 문체 끔'}
          </button>
        )}
        {includeContext &&
          context?.chips.map((c, i) => (
            <span key={i} className={`ai-chip ctx ctx-${c.kind}`}>
              {c.label}
            </span>
          ))}
        {includeContext && context && context.estTokens > 0 && (
          <span className="ai-tokens">~{context.estTokens.toLocaleString('ko')} 토큰</span>
        )}
        {includeContext && context && context.chips.length === 0 && (
          <span className="ai-tokens">문서를 열면 자동으로 봅니다</span>
        )}
      </div>

      <div className="ai-attachments">
        <button className="ai-attach-add" onClick={() => void addAttachment()} title="이미지·PDF를 AI에 첨부">
          📎 자료 첨부
        </button>
        {attachments.map((a) => (
          <span key={a.path} className={`ai-attach${a.ok ? '' : ' warn'}`} title={a.note}>
            {a.kind === 'image' ? '🖼' : '📄'} {a.name}
            {!a.ok && ' ⚠'}
            <button className="ai-attach-x" onClick={() => removeAttachment(a.path)} title="첨부 제거">
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <div className="ai-hint">
            채팅으로 물어보거나, 아래 빠른 액션으로 이어쓰기·퇴고를 요청하세요.
            <br />
            본문에서 <b>「/」</b>를 치면 쓰던 자리에서 바로 부릅니다 — 제안은 흐린 글씨로 먼저
            보이고 <kbd>Tab</kbd>이 확정, <kbd>Esc</kbd>가 취소입니다.
            <br />
            📎로 자료 폴더의 이미지·PDF·메모를 첨부하면 AI가 함께 읽습니다.
            <br />
            결과는 &lsquo;본문에 넣기&rsquo;로만 원고에 반영됩니다.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-msg-body">{m.content}</div>
            {m.role === 'assistant' && (
              <button className="ai-insert" onClick={() => insertOrReplace(m.content)}>
                본문에 넣기
              </button>
            )}
          </div>
        ))}
        {streaming && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-msg-body">
              {openingFiles.length > 0
                ? `📖 ${openingFiles.join(', ')} 읽는 중…`
                : streamText || '…'}
            </div>
          </div>
        )}
        {error && <div className="ai-error">{error}</div>}
      </div>

      <div className="ai-actions">
        <button onClick={() => quickAction('continue')} disabled={streaming || !connected}>
          이어쓰기
        </button>
        <button onClick={() => quickAction('revise')} disabled={streaming || !connected}>
          선택 퇴고
        </button>
        <button
          onClick={() => void analyzeStyle()}
          disabled={streaming || !connected}
          title="문체 방(style/samples)의 기존 원고를 분석해 문체지침 초안을 만듭니다"
        >
          ✍ 문체 분석
        </button>
      </div>

      <div className="ai-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder={connected ? '메시지 (Enter 전송, Shift+Enter 줄바꿈)' : '먼저 ⚙에서 프로바이더를 설정하세요'}
          rows={2}
          disabled={!connected}
        />
        {streaming ? (
          <button className="ai-stop" onClick={() => cancel()}>
            중지
          </button>
        ) : (
          <button className="ai-send" onClick={onSend} disabled={!connected || !input.trim()}>
            보내기
          </button>
        )}
      </div>
    </div>
  )
}
