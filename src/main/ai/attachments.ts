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

/**
 * CLI·텍스트 전용 — 텍스트 첨부는 인라인으로, 이미지는 **파일 경로**로 넘긴다.
 *
 * CLI 에이전트(claude·codex)는 파일을 읽는 도구를 자기가 갖고 있고 이미지도 열어 볼 수 있다.
 * base64를 프롬프트에 욱여넣는 대신 경로를 주고 "직접 열어 보라"고 하는 편이 정확하고 가볍다.
 * (--add-dir로 원고 폴더 읽기 권한을 함께 준다 — cli.ts)
 */
export function attachmentsToText(m: ChatMessage): string {
  const atts = m.attachments ?? []
  if (atts.length === 0) return m.content
  const extra: string[] = []
  for (const a of atts) {
    if (a.kind === 'image') {
      extra.push(
        a.absPath
          ? `[첨부 이미지: ${a.name} — 파일 경로: ${a.absPath}\n이 파일을 직접 열어(Read) 내용을 확인하세요.]`
          : `[첨부 이미지: ${a.name} (${a.path}) — 프로젝트 폴더에서 이 파일을 열어 확인하세요.]`
      )
    } else if (a.text) {
      extra.push(`[첨부 자료: ${a.name}]\n${a.text}`)
    }
  }
  return [m.content, ...extra].filter(Boolean).join('\n\n')
}
