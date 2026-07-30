/**
 * 대사·생각 부호 자동 짝(BLUEPRINT §6.1c) — 소설은 따옴표를 가장 많이 두드린다.
 *
 * 여는 부호를 치면 닫는 부호까지 넣고 커서를 그 안에 둔다. 닫는 부호를 손으로 칠 때는
 * 이미 놓여 있는 짝을 **건너뛴다**(그래야 `""`가 두 벌 생기지 않는다).
 *
 * 이 파일은 **순수 함수만** 담는다 — CodeMirror 없이 문자열만으로 단위 테스트한다(§11).
 * 배선(입력 가로채기·Backspace)은 renderer/lib/typing.ts.
 */

export interface QuotePair {
  open: string
  close: string
}

/**
 * 다룰 부호 목록. 쌍따옴표(대사)·따옴표(생각)가 본론이고, 낫표·둥근 따옴표는 원고 관례상 덤이다.
 * 소괄호는 **일부러 넣지 않았다** — 서술문에서 여닫이가 짝을 이루지 않는 일이 흔해 방해가 된다.
 */
export const QUOTE_PAIRS: readonly QuotePair[] = [
  { open: '"', close: '"' },
  { open: "'", close: "'" },
  { open: '“', close: '”' },
  { open: '‘', close: '’' },
  { open: '「', close: '」' },
  { open: '『', close: '』' }
]

export type QuoteAction =
  /** 선택한 글을 통째로 감싼다. */
  | { kind: 'wrap'; open: string; close: string }
  /** 짝을 넣고 커서를 그 안으로. */
  | { kind: 'pair'; open: string; close: string }
  /** 이미 놓여 있는 닫는 부호를 건너뛴다(글자는 넣지 않는다). */
  | { kind: 'skip'; close: string }
  /** 개입하지 않는다 — 평소대로 한 글자만 들어간다. */
  | null

/** 글자·숫자인가 — 여기 붙어 있으면 짝을 넣지 않는다(영문 아포스트로피 don't 보호). */
const WORDISH = /[\p{L}\p{N}]/u

/**
 * 방금 친 부호에 무슨 일을 해야 하는가.
 *
 * @param typed        방금 친 한 글자
 * @param before       커서 **앞** 글자(줄 처음이면 빈 문자열)
 * @param after        커서 **뒤** 글자(줄 끝이면 빈 문자열 — 줄바꿈도 빈칸으로 넘겨도 된다)
 * @param hasSelection 드래그로 고른 글이 있는가
 */
export function quoteAction(
  typed: string,
  before: string,
  after: string,
  hasSelection: boolean
): QuoteAction {
  // ① 닫는 부호를 그 짝 바로 앞에서 쳤다 → 건너뛴다.
  //    대칭 부호(" ')도 여기에 먼저 걸린다 — 대사를 닫는 가장 흔한 손놀림이라 우선순위가 높다.
  if (!hasSelection && typed === after && QUOTE_PAIRS.some((p) => p.close === typed)) {
    return { kind: 'skip', close: typed }
  }

  const pair = QUOTE_PAIRS.find((p) => p.open === typed)
  if (!pair) return null // 우리가 다루는 부호가 아니다

  // ② 고른 글이 있으면 감싼다.
  if (hasSelection) return { kind: 'wrap', open: pair.open, close: pair.close }

  // ③ 글자에 딱 붙어 있으면 개입하지 않는다.
  //    · 앞이 글자 → don't 같은 아포스트로피, 또는 손으로 닫는 부호를 치는 중
  //    · 뒤가 글자 → 이미 쓴 문장 앞에 부호만 덧붙이는 중(감싸기는 드래그로 한다)
  if (WORDISH.test(before) || WORDISH.test(after)) return null

  return { kind: 'pair', open: pair.open, close: pair.close }
}

/** 커서가 **빈 짝** 사이에 있는가(`"|"`) — Backspace 한 번에 둘 다 지우기 위한 판정. */
export function emptyQuotePair(before: string, after: string): boolean {
  return QUOTE_PAIRS.some((p) => p.open === before && p.close === after)
}
