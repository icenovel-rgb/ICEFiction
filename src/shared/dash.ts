/**
 * 줄 앞 줄표(`--`) → 불릿(`• `) 변환(BLUEPRINT §6.1c).
 *
 * 왜 이렇게 하나: 마크다운 표준 불릿은 `- `인데, 소설 원고는 줄표(`-`, `--`)를 훨씬 자주 쓴다.
 * 그래서 이 앱은 `- `를 목록으로 **꾸미지 않고**(사용자 요청), 대신 줄 앞에서 `-`를 두 번 치면
 * 가운뎃점 불릿 `• `으로 바꾼다. 파일에도 `• ` 문자를 그대로 기록하므로 옵시디언·워드·메모장
 * 어디서 열어도 불릿으로 보인다(이식성 §6.11).
 *
 * 함정: 이러면 가로 구분선 `---`을 칠 수 없게 된다(두 번째 `-`에서 이미 불릿으로 바뀌므로).
 * 그래서 **세 번째 `-`는 불릿을 `---`으로 되돌린다** — 세 번 두드리면 구분선, 두 번이면 불릿.
 *
 * 이 파일은 **순수 함수만** 담는다(§11).
 */

/** 불릿 — 가운뎃점 + 공백 한 칸. 파일에 이 문자 그대로 들어간다. */
export const BULLET = '• '

/** 가로 구분선(마크다운 표준). */
export const RULE = '---'

/** 들여쓰기(전각공백·탭·공백)만 있고 그 뒤에 `-` 하나 — 두 번째 `-`를 치는 순간. */
const DASH_ONLY = /^[　\t ]*-$/
/** 들여쓰기 + 방금 만든 불릿 — 세 번째 `-`를 치는 순간. */
const BULLET_ONLY = new RegExp(`^[　\\t ]*${BULLET}$`)

export interface DashRewrite {
  /** 커서 앞에서 지울 글자 수. */
  back: number
  /** 그 자리에 넣을 글자. */
  insert: string
}

/**
 * 방금 친 `-`가 줄 앞 줄표를 불릿(또는 구분선)으로 바꿔야 하는 자리인가.
 *
 * @param beforeCursor 그 줄에서 커서 **앞** 부분(줄 시작부터)
 * @param afterCursor  그 줄에서 커서 **뒤** 부분(줄 끝까지)
 * @param typed        방금 친 한 글자
 * @returns 바꿀 내용, 아니면 null(평소대로 `-` 한 글자)
 */
export function dashRewrite(
  beforeCursor: string,
  afterCursor: string,
  typed: string
): DashRewrite | null {
  if (typed !== '-') return null
  // 줄 끝에서만 바꾼다 — 이미 써 둔 줄 앞에 커서를 놓고 손보는 중이면 건드리지 않는다.
  if (afterCursor !== '') return null
  if (DASH_ONLY.test(beforeCursor)) return { back: 1, insert: BULLET }
  if (BULLET_ONLY.test(beforeCursor)) return { back: BULLET.length, insert: RULE }
  return null
}
