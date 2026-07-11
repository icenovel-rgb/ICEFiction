/**
 * Anthropic API 어댑터 — Claude 계열(BLUEPRINT §7.1). /v1/messages 스트리밍(SSE).
 * system 메시지는 별도 필드로, 나머지는 user/assistant messages로 변환한다.
 */
import type { AIConnStatus, ChatMessage } from '../../shared/types'
import type { TextAI } from './adapter'
import { toAnthropicContent } from './attachments'
import { AIError, classifyError } from './errors'
import { sseData } from './sse'

const API = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

export class AnthropicAI implements TextAI {
  name = 'Claude API'
  constructor(
    private model: string,
    private apiKey: string
  ) {}

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': VERSION
    }
  }

  private split(messages: ChatMessage[]): {
    system: string
    msgs: { role: string; content: string | Array<Record<string, unknown>> }[]
  } {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    // 첨부가 있으면 content를 블록 배열(text+image)로, 없으면 문자열 그대로.
    const msgs = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: toAnthropicContent(m) }))
    return { system, msgs }
  }

  async generate(
    messages: ChatMessage[],
    onDelta: (t: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const { system, msgs } = this.split(messages)
    let res: Response
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          system: system || undefined,
          messages: msgs,
          stream: true
        }),
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
        let evt: { type?: string; delta?: { text?: string }; error?: { message?: string } }
        try {
          evt = JSON.parse(payload)
        } catch {
          continue
        }
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          full += evt.delta.text
          onDelta(evt.delta.text)
        } else if (evt.type === 'error') {
          const m = evt.error?.message || '오류'
          throw new AIError(classifyError(m), m, m)
        }
      }
    } catch (e) {
      if (signal.aborted) throw new AIError('cancelled', '중지했습니다')
      throw e
    }
    return full
  }

  async listModels(): Promise<string[]> {
    const fallback = [
      'claude-sonnet-4-5',
      'claude-opus-4-1',
      'claude-3-7-sonnet-latest',
      'claude-3-5-haiku-latest'
    ]
    if (!this.apiKey) return fallback
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', { headers: this.headers() })
      if (!res.ok) return fallback
      const json = (await res.json()) as { data?: { id?: string }[] }
      const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => !!id)
      return ids.length ? ids : fallback
    } catch {
      return fallback
    }
  }

  async checkConnection(): Promise<AIConnStatus> {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        })
      })
      if (res.ok) return { ok: true, state: 'ok', detail: `Claude API 연결 확인 (${this.model})` }
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
