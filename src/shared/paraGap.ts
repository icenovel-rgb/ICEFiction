/**
 * 문단 간격을 없앨 줄 고르기(BLUEPRINT §8.1).
 *
 * 이 앱에서 마크다운 한 문단은 한 줄(.cm-line)이고, 문단 간격은 **그 줄 아래 여백**으로 준다.
 * 따라서 "간격이 붙지 않아야 하는 줄"을 고르는 것이 곧 이 기능의 전부다.
 *
 *  · blank    빈 줄 — 원고에 이미 있던 빈 줄까지 벌어지면 기존 원고가 두 배로 뜬다
 *  · soft     Shift+Enter로 만든 줄바꿈 — 줄간격만 적용(문단이 아니라 같은 문단의 다음 줄)
 *  · dialogue 연속되는 대사 — 보기 옵션(대사가 이어질 땐 붙이고, 서술과의 경계는 벌린다)
 *
 * 이 파일은 **순수 함수만** 담는다(§11). 화면 배선은 renderer/lib/markdownView.ts.
 */

/**
 * Shift+Enter가 파일에 남기는 표시 = **줄 끝 공백 두 칸**.
 *
 * 마크다운 표준 하드 브레이크(CommonMark)라서 깃허브·옵시디언·pandoc이 모두 `<br>`로 읽고,
 * 눈에 보이는 기호를 원고에 남기지 않는다(`\`를 쓰는 방법도 있지만 원고에 글자가 보인다).
 */
export const SOFT_BREAK = '  '

/** 대사·생각을 여는 부호 — 이 중 하나로 시작하는 줄을 '대사 줄'로 본다. */
const DIALOGUE_OPENERS = new Set(['"', "'", '“', '‘', '「', '『'])

/** 줄 앞 들여쓰기(전각공백·탭·공백). */
const LEADING_INDENT = /^[　\t ]+/

export type GapKind = 'blank' | 'soft' | 'dialogue' | null

/** 내용이 없는 줄인가(공백만 있어도 빈 줄로 본다). */
function isBlank(text: string): boolean {
  return text.trim() === ''
}

/** 대사 줄인가 — 들여쓰기를 걷어낸 첫 글자가 따옴표 계열. 인용(>)·제목(#)은 대사가 아니다. */
export function isDialogueLine(text: string): boolean {
  const t = text.replace(LEADING_INDENT, '')
  if (!t) return false
  return DIALOGUE_OPENERS.has(t[0])
}

/** Shift+Enter로 끝낸 줄인가 — 내용이 있고 줄 끝에 공백 두 칸. */
export function hasSoftBreak(text: string): boolean {
  return !isBlank(text) && text.endsWith(SOFT_BREAK)
}

/**
 * 이 줄 아래 간격을 어떻게 할지.
 *
 * @param text        판정할 줄
 * @param nextContent 아래쪽 **내용 있는** 줄(없으면 null — 문서 끝)
 */
export function gapKindAt(text: string, nextContent: string | null): GapKind {
  if (isBlank(text)) return 'blank'
  // 사용자가 직접 시킨 줄바꿈이 연속 대사 규칙보다 우선한다.
  if (hasSoftBreak(text)) return 'soft'
  if (nextContent != null && isDialogueLine(text) && isDialogueLine(nextContent)) return 'dialogue'
  return null
}

/**
 * i번째 줄 아래에서 내용이 있는 첫 줄. 빈 줄은 건너뛴다 —
 * 빈 줄로 문단을 갈라 쓴 기존 원고에서도 "대사가 이어진다"를 알아보게.
 */
export function nextContentLine(lines: readonly string[], i: number): string | null {
  for (let k = i + 1; k < lines.length; k += 1) {
    const line = lines[k] ?? ''
    if (!isBlank(line)) return line
  }
  return null
}

/** 문서 전체를 줄별로 판정한다(테스트·일괄 처리용). */
export function gapKinds(lines: readonly string[]): GapKind[] {
  return lines.map((line, i) => gapKindAt(line, nextContentLine(lines, i)))
}
