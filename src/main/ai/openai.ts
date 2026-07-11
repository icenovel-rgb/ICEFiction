/**
 * OpenAI 호환 어댑터 — base URL만 바꾸면 OpenAI·Ollama·LM Studio·OpenRouter·Groq 등을 모두 커버
 * (BLUEPRINT §7.1). /chat/completions 스트리밍(SSE) + /models 로 연결 확인.
 */
import type { AIConnStatus, ChatMessage } from '../../shared/types'
import type { TextAI } from './adapter'
import { toOpenAIContent } from './attachments'
import { AIError, classifyError } from './errors'
import { sseData } from './sse'

export class OpenAICompatAI implements TextAI {
  name: string
  constructor(
    private baseUrl: string,
    private model: string,
    private apiKey: string
  ) {
    this.name = baseUrl.includes('11434') || baseUrl.includes('1234') ? '로컬 LLM' : 'OpenAI 호환'
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`
    return h
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`
  }

  async generate(
    messages: ChatMessage[],
    onDelta: (t: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    let res: Response
    try {
      // 첨부가 있는 메시지는 content를 파트 배열(text+image_url)로 확장한다(vision). 없으면 문자열 그대로.
      const payloadMessages = messages.map((m) => ({ role: m.role, content: toOpenAIContent(m) }))
      res = await fetch(this.url('/chat/completions'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ model: this.model, messages: payloadMessages, stream: true }),
        signal
      })
    } catch (e) {
      if (signal.aborted) throw new AIError('cancelled', '중지했습니다')
      const msg = e instanceof Error ? e.message : String(e)
      throw new AIError(classifyError(msg), msg, msg)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const text = `${res.status} ${body}`
      throw new AIError(classifyError(text), `요청 실패 (${res.status})`, text)
    }
    let full = ''
    try {
      for await (const payload of sseData(res)) {
        if (payload === '[DONE]') break
        let json: {
          choices?: { delta?: { content?: string }; finish_reason?: string }[]
        }
        try {
          json = JSON.parse(payload)
        } catch {
          continue
        }
        const piece = json.choices?.[0]?.delta?.content
        if (piece) {
          full += piece
          onDelta(piece)
        }
      }
    } catch (e) {
      if (signal.aborted) throw new AIError('cancelled', '중지했습니다')
      throw e
    }
    return full
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(this.url('/models'), { headers: this.headers() })
      if (!res.ok) return []
      const json = (await res.json()) as { data?: { id?: string }[] }
      return (json.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => !!id)
        .sort()
    } catch {
      return []
    }
  }

  async checkConnection(): Promise<AIConnStatus> {
    try {
      const res = await fetch(this.url('/models'), { headers: this.headers() })
      if (res.ok) return { ok: true, state: 'ok', detail: `${this.name} 연결 확인 (${this.model})` }
      const body = await res.text().catch(() => '')
      const kind = classifyError(`${res.status} ${body}`)
      return {
        ok: false,
        state: kind === 'auth_expired' ? 'auth' : kind === 'rate_limited' ? 'limit' : 'error',
        detail: `연결 실패 (${res.status})`
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, state: 'error', detail: `연결 실패: ${msg}` }
    }
  }
}
