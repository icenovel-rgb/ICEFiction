/**
 * 자료 첨부 → 프로바이더별 메시지 content 변환(BLUEPRINT §7.5).
 * 이미지는 vision 입력(base64), PDF·텍스트는 추출 텍스트로 넣는다. CLI 계열은 이미지를 직접 못 보므로
 * 그 사실을 텍스트로 알린다(계열별 능력 차이). 첨부가 없으면 기존 문자열 content 그대로.
 */
import type { ChatMessage } from '../../shared/types'

/** OpenAI 호환 /chat/completions content — 이미지=image_url(data URL), 텍스트=text 파트. */
export function toOpenAIContent(m: ChatMessage): string | Array<Record<string, unknown>> {
  const atts = m.attachments ?? []
  if (atts.length === 0) return m.content
  const parts: Array<Record<string, unknown>> = []
  if (m.content) parts.push({ type: 'text', text: m.content })
  for (const a of atts) {
    if (a.kind === 'image' && a.dataBase64) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${a.mediaType || 'image/png'};base64,${a.dataBase64}` }
      })
    } else if (a.kind === 'text' && a.text) {
      parts.push({ type: 'text', text: `[첨부 자료: ${a.name}]\n${a.text}` })
    }
  }
  return parts.length ? parts : m.content
}

/** Anthropic /v1/messages content — 이미지=image(base64), 텍스트=text 블록. */
export function toAnthropicContent(m: ChatMessage): string | Array<Record<string, unknown>> {
  const atts = m.attachments ?? []
  if (atts.length === 0) return m.content
  const blocks: Array<Record<string, unknown>> = []
  if (m.content) blocks.push({ type: 'text', text: m.content })
  for (const a of atts) {
    if (a.kind === 'image' && a.dataBase64) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mediaType || 'image/png', data: a.dataBase64 }
      })
    } else if (a.kind === 'text' && a.text) {
      blocks.push({ type: 'text', text: `[첨부 자료: ${a.name}]\n${a.text}` })
    }
  }
  return blocks.length ? blocks : m.content
}

/** CLI·텍스트 전용 — 이미지는 직접 못 보므로 안내, 텍스트 첨부는 인라인으로. */
export function attachmentsToText(m: ChatMessage): string {
  const atts = m.attachments ?? []
  if (atts.length === 0) return m.content
  const extra: string[] = []
  for (const a of atts) {
    if (a.kind === 'image') {
      extra.push(`[첨부 이미지: ${a.name} — 이 방식(CLI)에서는 이미지를 직접 보지 못합니다]`)
    } else if (a.text) {
      extra.push(`[첨부 자료: ${a.name}]\n${a.text}`)
    }
  }
  return [m.content, ...extra].filter(Boolean).join('\n\n')
}
