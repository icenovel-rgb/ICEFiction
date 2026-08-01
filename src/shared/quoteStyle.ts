/**
 * 따옴표 **모양** 통일(BLUEPRINT §6.1c).
 *
 * "같은 글꼴인데 따옴표 모양이 다르다"는 글꼴 탓이 아니다. 아예 **다른 글자**다 —
 * 자판으로 치는 `"`(U+0022)는 위아래로 곧고, 출판물에서 쓰는 `“ ”`(U+201C·U+201D)는 둥글게
 * 말려 있다. 내장 글꼴 4종 모두 두 글자를 다 갖고 있으므로(fontTools로 확인), 한 원고 안에서
 * 모양이 섞여 보이는 건 **글자가 섞여 있기 때문**이다. 손으로 친 대사는 곧은 따옴표, AI가 쓴
 * 대사나 붙여넣은 글은 둥근 따옴표인 식이다.
 *
 * 그래서 고치는 방법도 글꼴이 아니라 글자다. 어느 쪽으로 통일할지 정하면
 *  ① 앞으로 치는 따옴표는 그 모양으로 들어가고(자동 짝),
 *  ② 이미 쓴 글도 한 번에 바꿔 준다(normalizeQuotes).
 *
 * 이 파일은 순수 함수만 담는다(§11).
 */

/** keep = 친 그대로(지금까지의 동작) · straight = 곧은 " ' · curly = 둥근 “ ” ‘ ’ */
export type QuoteStyle = 'keep' | 'straight' | 'curly'

export const QUOTE_STYLE_LABEL: Record<QuoteStyle, string> = {
  keep: '건드리지 않음',
  straight: '곧은 " \'',
  curly: '둥근 “ ” ‘ ’'
}

/** 한 계열의 여닫이 짝. 곧은 쪽은 여닫이가 같은 글자다. */
interface StylePair {
  open: string
  close: string
}

const DOUBLE: Record<Exclude<QuoteStyle, 'keep'>, StylePair> = {
  straight: { open: '"', close: '"' },
  curly: { open: '“', close: '”' }
}
const SINGLE: Record<Exclude<QuoteStyle, 'keep'>, StylePair> = {
  straight: { open: "'", close: "'" },
  curly: { open: '‘', close: '’' }
}

/** 큰따옴표 계열의 모든 글자(모양이 무엇이든). */
const DOUBLE_CHARS = new Set(['"', '“', '”'])
/** 작은따옴표 계열. */
const SINGLE_CHARS = new Set(["'", '‘', '’'])

/**
 * 이 글자가 어느 계열인지 — 낫표(「」『』)는 **손대지 않는다.** 곧은/둥근이라는 축이 없는
 * 별개의 부호이고, 쓰는 사람이 일부러 고른 것이기 때문이다.
 */
export function quoteFamilyOf(ch: string): 'double' | 'single' | null {
  if (DOUBLE_CHARS.has(ch)) return 'double'
  if (SINGLE_CHARS.has(ch)) return 'single'
  return null
}

/** 고른 모양의 여닫이 짝을 준다(keep이면 null — 부르는 쪽이 원래 짝을 쓴다). */
export function styledPair(family: 'double' | 'single', style: QuoteStyle): StylePair | null {
  if (style === 'keep') return null
  return family === 'double' ? DOUBLE[style] : SINGLE[style]
}

/** 글자·숫자인가 — 여는/닫는 판정과 아포스트로피 보호에 쓴다. */
const WORDISH = /[\p{L}\p{N}]/u

/**
 * 여는 자리인가 — **앞 글자**로 판단한다(출판 조판의 기본 규칙).
 * 줄 처음이거나 공백·여는 괄호 뒤면 여는 따옴표, 그 밖(글자·문장부호 뒤)이면 닫는 따옴표.
 */
function isOpeningAt(before: string): boolean {
  if (!before) return true
  return /[\s　([{<“‘「『]/.test(before)
}

/**
 * 이미 쓴 글의 따옴표를 고른 모양으로 통일한다.
 *
 * 곧은 → 둥근은 **여는지 닫는지 가려야** 해서 앞 글자를 본다. 되돌리기(둥근 → 곧은)는
 * 판단이 필요 없다. 낫표는 건드리지 않는다.
 *
 * ⚠️ 영문 아포스트로피(`don't`)는 글자 사이에 낀 `'`이다 — 이건 **여는 따옴표가 아니라**
 * 오른쪽 작은따옴표(’)가 맞다(활자 관례). 그래서 글자 사이면 무조건 닫는 모양으로 준다.
 */
export function normalizeQuotes(text: string, style: QuoteStyle): string {
  if (style === 'keep' || !text) return text
  const chars = Array.from(text)
  const out: string[] = []
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    const family = quoteFamilyOf(ch)
    if (!family) {
      out.push(ch)
      continue
    }
    const pair = family === 'double' ? DOUBLE[style] : SINGLE[style]
    const before = i > 0 ? chars[i - 1] : ''
    const after = i + 1 < chars.length ? chars[i + 1] : ''
    // 글자 사이에 낀 작은따옴표 = 아포스트로피 → 항상 닫는 모양.
    const apostrophe = family === 'single' && WORDISH.test(before) && WORDISH.test(after)
    out.push(!apostrophe && isOpeningAt(before) ? pair.open : pair.close)
  }
  return out.join('')
}

/** 이 글에 통일할 거리가 있는가(단추를 눌러도 아무 일이 없을 때를 알려 주기 위해). */
export function countQuotesToChange(text: string, style: QuoteStyle): number {
  if (style === 'keep') return 0
  const next = normalizeQuotes(text, style)
  if (next === text) return 0
  const a = Array.from(text)
  const b = Array.from(next)
  let n = 0
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1
  return n
}
