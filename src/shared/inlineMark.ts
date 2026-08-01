/**
 * 굵게·기울임·밑줄 토글(BLUEPRINT §6.1d) — Ctrl+B / Ctrl+I / Ctrl+U.
 *
 * 마크다운에는 **밑줄 문법이 없다.** 그래서 표준 HTML `<u>`로 감싼다 —
 * 문단 정렬을 `<div align>`으로 기록하는 것과 같은 이유로, 깃허브·옵시디언에서도 밑줄로 보인다(§6.11).
 *
 * 함정(테스트로 고정): `**굵게**` 안쪽에 기울임을 걸면 굵게 마커의 `*` 한 짝을 갉아먹어
 * `*굵게*`가 돼 버리기 쉽다. 겹칠 때는 `***굵게***`가 되어야 한다.
 *
 * 이 파일은 **순수 함수만** 담는다(§11).
 */

export interface MarkStyle {
  /** 사람에게 보일 이름(안내 문구용). */
  name: string
  open: string
  close: string
}

export const BOLD: MarkStyle = { name: '굵게', open: '**', close: '**' }
export const ITALIC: MarkStyle = { name: '기울임', open: '*', close: '*' }
export const UNDERLINE: MarkStyle = { name: '밑줄', open: '<u>', close: '</u>' }

export interface MarkEdit {
  /** 갈아치울 구간(문서 기준 오프셋) — 마커를 벗길 때는 선택 밖까지 넓어진다. */
  from: number
  to: number
  insert: string
  /** 편집 뒤 선택 구간(안쪽 글을 계속 가리킨다). */
  anchor: number
  head: number
}

/**
 * 별표 하나(기울임)를 벗기려는데 그 별표가 실은 `**`(굵게)의 일부인가.
 * 굵게 마커를 반쪽만 떼면 문법이 깨지므로, 이 경우엔 벗기지 않고 한 겹 더 감싼다.
 */
function starIsPartOfBold(text: string, from: number, to: number, style: MarkStyle): boolean {
  if (style.open !== '*') return false
  return text.slice(from - 2, from - 1) === '*' || text.slice(to + 1, to + 2) === '*'
}

/** 선택 안쪽이 `**…**`인데 기울임을 벗기려는 상황인가(위와 같은 이유). */
function selectionIsBold(sel: string, style: MarkStyle): boolean {
  if (style.open !== '*') return false
  return sel.startsWith('**') || sel.endsWith('**')
}

/**
 * 선택 구간에 서식을 걸거나 벗긴다(같은 단축키를 다시 누르면 해제).
 *
 * @param text  문서 전체
 * @param from  선택 시작(커서만 있으면 from === to)
 * @param to    선택 끝
 */
export function toggleMark(text: string, from: number, to: number, style: MarkStyle): MarkEdit {
  // ① 커서만 있으면 빈 짝을 넣고 안으로 — "이제부터 굵게 쓴다".
  if (from === to) {
    const at = from + style.open.length
    return { from, to, insert: style.open + style.close, anchor: at, head: at }
  }

  /**
   * 선택 양끝의 공백은 **마커 밖에 둔다**(사용자 신고로 고침). 두 가지가 한꺼번에 걸린다.
   *  ① 마크다운은 `**글 **`을 강조로 읽지 않는다(닫는 마커 앞이 공백이면 안 된다) — 별표가
   *     결과물에 그대로 보인다. 줄 전체를 고르는 Home→Shift+End가 딱 이 모양을 만든다.
   *  ② 줄 끝 공백 두 칸은 Shift+Enter가 남긴 하드 브레이크다. 마커가 그걸 삼키면 줄바꿈 표시가
   *     죽어 그 줄에 문단 간격이 붙는다(화면이 달라진다).
   * 그래서 마커는 **글자에만** 붙이고 공백은 있던 자리에 그대로 둔다.
   */
  const lead = /^\s*/.exec(text.slice(from, to))![0]
  const tail = lead.length < to - from ? /\s*$/.exec(text.slice(from, to))![0] : ''
  const coreFrom = from + lead.length
  const coreTo = to - tail.length
  const sel = text.slice(coreFrom, coreTo)

  // 공백만 골랐다 → 깨진 마커(`**   **`)를 만들지 않고 커서처럼 빈 짝만 넣는다.
  if (!sel) {
    const at = from + style.open.length
    return { from, to: from, insert: style.open + style.close, anchor: at, head: at }
  }

  // ② 마커까지 통째로 골랐으면 벗긴다.
  if (
    sel.length >= style.open.length + style.close.length &&
    sel.startsWith(style.open) &&
    sel.endsWith(style.close) &&
    !selectionIsBold(sel, style)
  ) {
    const inner = sel.slice(style.open.length, sel.length - style.close.length)
    return { from: coreFrom, to: coreTo, insert: inner, anchor: coreFrom, head: coreFrom + inner.length }
  }

  // ③ 선택 바로 밖에 마커가 있으면(=이미 걸린 서식의 안쪽을 골랐다) 벗긴다.
  if (
    text.slice(Math.max(0, coreFrom - style.open.length), coreFrom) === style.open &&
    text.slice(coreTo, coreTo + style.close.length) === style.close &&
    !starIsPartOfBold(text, coreFrom, coreTo, style)
  ) {
    const start = coreFrom - style.open.length
    return {
      from: start,
      to: coreTo + style.close.length,
      insert: sel,
      anchor: start,
      head: start + sel.length
    }
  }

  // ④ 아니면 감싼다(공백은 손대지 않으므로 편집 구간도 글자만큼만).
  const anchor = coreFrom + style.open.length
  return {
    from: coreFrom,
    to: coreTo,
    insert: style.open + sel + style.close,
    anchor,
    head: anchor + sel.length
  }
}
