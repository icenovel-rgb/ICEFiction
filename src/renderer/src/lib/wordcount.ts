/**
 * 한글 집필용 글자수·원고지 계산(BLUEPRINT §6.1).
 *
 * 원고지 매수: 한국 표준 200자 원고지(20자×10행). 원고지는 공백·문장부호도 한 칸이므로
 * 공백 포함 글자수를 200으로 나눈다. 소수 첫째 자리까지 표시한다.
 */
const MANUSCRIPT_CELL = 200

export interface Counts {
  withSpaces: number
  withoutSpaces: number
  manuscriptPages: number
}

export function countText(text: string): Counts {
  // 이모지·서로게이트를 한 글자로 세도록 Array.from 사용.
  const chars = Array.from(text)
  const withSpaces = chars.length
  const withoutSpaces = chars.filter((c) => !/\s/.test(c)).length
  return {
    withSpaces,
    withoutSpaces,
    manuscriptPages: Math.round((withSpaces / MANUSCRIPT_CELL) * 10) / 10
  }
}
