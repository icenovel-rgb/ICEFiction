/**
 * 대사·생각 부호 자동 짝(BLUEPRINT §6.1c) — 소설은 따옴표를 가장 많이 두드린다.
 *
 * 여는 부호를 치면 닫는 부호까지 넣고 커서를 그 안에 둔다. 닫는 부호를 손으로 칠 때는
 * 이미 놓여 있는 짝을 **건너뛴다**(그래야 `""`가 두 벌 생기지 않는다).
 *
 * 이 파일은 **순수 함수만** 담는다 — CodeMirror 없이 문자열만으로 단위 테스트한다(§11).
 * 배선(입력 가로채기·Backspace)은 renderer/lib/typing.ts.
 */
import { quoteFamilyOf, styledPair, type QuoteStyle } from './quoteStyle'

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
  hasSelection: boolean,
  style: QuoteStyle = 'keep'
): QuoteAction {
  /**
   * 모양 통일(§6.1c) — 고른 모양이 있으면 **친 글자가 아니라 그 모양으로** 넣는다.
   * 자판에는 곧은 `"` 하나뿐이라, 둥근 따옴표로 쓰려면 여기서 갈아 끼워야 한다.
   * 낫표는 계열이 없어(quoteFamilyOf가 null) 친 그대로 간다.
   */
  const family = quoteFamilyOf(typed)
  const styled = family ? styledPair(family, style) : null

  // ① 닫는 부호를 그 짝 바로 앞에서 쳤다 → 건너뛴다.
  //    대칭 부호(" ')도 여기에 먼저 걸린다 — 대사를 닫는 가장 흔한 손놀림이라 우선순위가 높다.
  //    모양을 통일하는 중이면 **친 글자가 아니라 통일된 닫는 부호**와 견준다
  //    (자판으로 `"`를 쳐서 `”`를 건너뛰어야 하기 때문).
  const closeToSkip = styled ? styled.close : typed
  if (
    !hasSelection &&
    closeToSkip === after &&
    (styled != null || QUOTE_PAIRS.some((p) => p.close === typed))
  ) {
    return { kind: 'skip', close: closeToSkip }
  }

  const base = QUOTE_PAIRS.find((p) => p.open === typed)
  // 통일 모드에서는 **닫는 글자를 쳐도** 여는 짝으로 친 것으로 본다 — 자판의 `"` 하나로 둥근
  // 여닫이를 모두 만들어야 하고, 위 ①에서 '닫기'는 이미 걸러졌기 때문이다.
  const pair = styled ?? base
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

/**
 * Enter로 따옴표 **밖으로** 빠져나갈 글자 수(0이면 평소 Enter).
 *
 * 짝을 자동으로 넣어 줬으니 닫을 때도 손이 덜 가야 한다 — 대사를 다 쓰면 닫는 따옴표를 한 번 더
 * 치고 나서야 다음 줄로 내려갈 수 있었다. 커서 뒤에 **닫는 부호만** 남았다면 Enter가 그 부호를
 * 지나쳐 다음 줄로 데려간다.
 *
 * 개입하는 조건을 좁게 잡는다(줄을 가르는 평범한 Enter를 빼앗지 않기 위해):
 *  · 커서 뒤가 줄 끝까지 **닫는 부호로만** 채워져 있어야 한다 — 공백 한 칸도 안 된다
 *    (줄 끝 공백 두 칸은 Shift+Enter의 하드 브레이크라, 삼키면 뜻이 달라진다)
 *  · 그 부호의 **여는 짝이 줄 앞쪽에 있어야** 한다 — 홀로 떠 있는 부호를 건너뛰지 않는다
 *
 * @param beforeInLine 줄 시작부터 커서까지
 * @param afterInLine  커서부터 줄 끝까지
 */
export function quoteExitLen(beforeInLine: string, afterInLine: string): number {
  if (!afterInLine) return 0
  const chars = Array.from(afterInLine)
  const pairs = chars.map((c) => QUOTE_PAIRS.find((p) => p.close === c))
  if (pairs.some((p) => !p)) return 0 // 닫는 부호가 아닌 글자가 섞였다 → 평소 Enter
  // 커서 바로 뒤 부호의 여는 짝이 줄 앞에 있어야 '내가 연 대사'다.
  if (!beforeInLine.includes(pairs[0]!.open)) return 0
  return afterInLine.length
}
