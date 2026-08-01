/**
 * 원고 아래 여백(BLUEPRINT §8.2).
 *
 * 문제: 마지막 줄을 쓰는 동안 커서가 창 바닥에 붙는다. 다음 줄이 어디에 놓일지 안 보이니
 * 손이 먼저 멈춘다. 원고 영역의 아래 여백이 32px 고정이었던 탓이다(한 줄 반도 안 된다).
 *
 * 고치는 데는 **두 가지가 다 필요하다.** 하나만으로는 안 된다.
 *  ① CSS 여백 — 문서 끝에서도 더 스크롤할 자리를 만든다(없으면 아무리 밀어도 안 올라간다).
 *  ② CM6 `scrollMargins` — 타이핑 중 커서를 그만큼 띄운다. CM6는 커서가 "보이기만 하면"
 *     더 스크롤하지 않으므로, ①만 넣으면 여백은 생겨도 커서는 여전히 바닥에 붙는다.
 *
 * 두 곳이 **같은 수**를 봐야 설정한 만큼 떨어진다. 그래서 계산을 여기 한 군데로 모은다.
 * 이 파일은 순수 함수만 담는다(§11) — tests가 import 하므로 `src/shared/`에 있어야 한다.
 */

/** 0 = 예전처럼 바닥에 붙임. 사용자가 명시적으로 고를 수 있는 값이므로 최솟값은 0이다. */
export const BOTTOM_PAD_MIN = 0

/**
 * 화면 높이의 60%. 그 이상은 글이 놓일 자리가 없어진다 — 여백을 위해 원고를 밀어내는 셈이라
 * 설정에서도 막고 계산에서도 막는다.
 */
export const BOTTOM_PAD_MAX = 60

/** 기본값 — 커서가 화면 아래 3분의 1 위쪽에서 멈춘다. 여러 편집기의 관행과 비슷한 정도. */
export const BOTTOM_PAD_DEFAULT = 30

/**
 * 설정 값을 쓸 수 있는 범위로 붙인다.
 *
 * 숫자가 아닌 것(옛 설정 파일, 손으로 고친 값, NaN)은 **0으로 떨어뜨린다** — 화면을 무너뜨리느니
 * 예전 동작(바닥에 붙음)으로 돌아가는 편이 낫다.
 */
export function clampBottomPad(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return BOTTOM_PAD_MIN
  if (value < BOTTOM_PAD_MIN) return BOTTOM_PAD_MIN
  if (value > BOTTOM_PAD_MAX) return BOTTOM_PAD_MAX
  return value
}

/**
 * 화면 높이 대비 %를 실제 픽셀로 — CM6 `scrollMargins`에 넘길 값.
 *
 * 정수로 내린다. 소수가 들어가면 스크롤 위치가 1px씩 흔들려 글자가 떠는 것처럼 보인다.
 */
export function bottomPadPx(percent: number, viewportPx: number): number {
  const pct = clampBottomPad(percent)
  if (pct === 0) return 0
  if (typeof viewportPx !== 'number' || !Number.isFinite(viewportPx) || viewportPx <= 0) return 0
  return Math.floor((viewportPx * pct) / 100)
}

/**
 * CSS 여백 값 — `vh`로 낸다. 창 크기가 바뀌어도 CSS가 알아서 따라가므로 리스너가 필요 없다.
 *
 * 0일 때만 `0px`로 낸다(`0vh`는 값이 0이라 단위가 무의미하고, 옛 브라우저에서 무시되는 일이 있다).
 */
export function bottomPadCss(percent: number): string {
  const pct = clampBottomPad(percent)
  return pct === 0 ? '0px' : `${pct}vh`
}
