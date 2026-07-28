/**
 * 마크다운 프론트매터(YAML) ↔ Frontmatter 타입 변환.
 *
 * YAML은 사람이 읽는 파일이라 snake_case(words_target), 코드는 camelCase(wordsTarget)를 쓴다.
 * 알려진 키만 매핑하고, 파서가 모르는 키는 extra에 손실 없이 보존해 저장 시 되돌려 쓴다
 * (외부 에디터 Obsidian 등이 넣은 커스텀 필드를 지우지 않기 위함 — §4).
 */
import matter from 'gray-matter'
import type { DocStatus, DocType, Frontmatter } from '../../shared/types'

/** YAML 키 → Frontmatter 필드. 나머지는 extra로. */
const KNOWN_KEYS = new Set([
  'type',
  'title',
  'status',
  'pov',
  'synopsis',
  'order',
  'words_target',
  'aliases',
  'images',
  'cover',
  'cover_art'
])

export function parseDoc(raw: string): { frontmatter: Frontmatter; body: string } {
  const parsed = matter(raw)
  const data = parsed.data as Record<string, unknown>
  const fm: Frontmatter = {}
  const extra: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    switch (key) {
      case 'type':
        fm.type = value as DocType
        break
      case 'title':
        fm.title = value == null ? undefined : String(value)
        break
      case 'status':
        fm.status = value as DocStatus
        break
      case 'pov':
        fm.pov = value == null ? undefined : String(value)
        break
      case 'synopsis':
        fm.synopsis = value == null ? undefined : String(value)
        break
      case 'order':
        fm.order = typeof value === 'number' ? value : Number(value) || undefined
        break
      case 'words_target':
        fm.wordsTarget = typeof value === 'number' ? value : Number(value) || undefined
        break
      case 'aliases':
        if (Array.isArray(value)) fm.aliases = value.map(String).filter(Boolean)
        else if (typeof value === 'string' && value.trim()) fm.aliases = [value.trim()]
        break
      case 'images':
        if (Array.isArray(value)) fm.images = value.map(String).filter(Boolean)
        break
      case 'cover':
        fm.cover = value == null ? undefined : String(value)
        break
      case 'cover_art':
        fm.coverArt = value == null ? undefined : String(value)
        break
      default:
        extra[key] = value
    }
  }
  if (Object.keys(extra).length > 0) fm.extra = extra
  return { frontmatter: fm, body: parsed.content.replace(/^\n/, '') }
}

export function stringifyDoc(frontmatter: Frontmatter, body: string): string {
  const data: Record<string, unknown> = {}
  if (frontmatter.type != null) data.type = frontmatter.type
  if (frontmatter.title != null) data.title = frontmatter.title
  if (frontmatter.status != null) data.status = frontmatter.status
  if (frontmatter.pov != null) data.pov = frontmatter.pov
  if (frontmatter.synopsis != null) data.synopsis = frontmatter.synopsis
  if (frontmatter.order != null) data.order = frontmatter.order
  if (frontmatter.wordsTarget != null) data.words_target = frontmatter.wordsTarget
  if (frontmatter.aliases && frontmatter.aliases.length > 0) data.aliases = frontmatter.aliases
  if (frontmatter.images && frontmatter.images.length > 0) data.images = frontmatter.images
  if (frontmatter.cover != null) data.cover = frontmatter.cover
  if (frontmatter.coverArt != null) data.cover_art = frontmatter.coverArt
  // 보존해 둔 미지 키 복원(알려진 키가 우선).
  if (frontmatter.extra) {
    for (const [k, v] of Object.entries(frontmatter.extra)) {
      if (!KNOWN_KEYS.has(k) && !(k in data)) data[k] = v
    }
  }
  // 프론트매터가 비면 순수 마크다운으로 저장(불필요한 --- 블록 방지).
  if (Object.keys(data).length === 0) return body.endsWith('\n') ? body : body + '\n'
  const out = matter.stringify(body, data)
  return out.endsWith('\n') ? out : out + '\n'
}

export { KNOWN_KEYS }
