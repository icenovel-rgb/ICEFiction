/**
 * 수치 입력(슬라이더 + 직접 입력 + 위아래 화살표)의 순수 계산 — 보기 설정 패널이 쓴다(§8.1).
 *
 * 슬라이더만으로는 0.1em 단위를 정확히 맞추기 어렵고, 값을 눈으로만 확인할 수 있어
 * 숫자를 직접 넣거나 한 칸씩 올리는 길을 함께 준다. 세 입력이 **같은 규칙**을 써야
 * 슬라이더로 만든 값과 화살표로 만든 값이 어긋나지 않는다 — 그 규칙을 여기 모았다.
 *
 * 부동소수점 주의: 0.1 스텝을 그냥 더하면 0.7 + 0.1 = 0.7999999999999999 가 된다.
 * 그래서 스텝 단위로 나눈 정수에서 반올림한 뒤 되돌린다.
 */

/** 스텝의 소수점 자릿수(0.1 → 1, 0.5 → 1, 1 → 0). 표시 자릿수로도 쓴다. */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const s = String(step)
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.length - dot - 1
}

/** 부동소수점 찌꺼기를 스텝 자릿수로 잘라낸다. */
function tidy(value: number, step: number): number {
  return Number(value.toFixed(stepDecimals(step)))
}

/**
 * 값을 [min, max] 안으로 넣고 step 격자에 맞춘다.
 * 격자는 min 기준 — min=1.4, step=0.1 이면 1.4·1.5·1.6… 이 유효한 값이다.
 */
export function clampToStep(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min
  if (value <= min) return min
  if (value >= max) return max
  const snapped = min + Math.round((value - min) / step) * step
  return tidy(Math.min(max, Math.max(min, snapped)), step)
}

/** 화살표 한 번 — delta 칸(보통 ±1)만큼 옮긴 값. 경계에서는 더 안 나간다. */
export function stepBy(
  value: number,
  delta: number,
  min: number,
  max: number,
  step: number
): number {
  const base = clampToStep(value, min, max, step)
  return clampToStep(tidy(base + delta * step, step), min, max, step)
}

/** 화면·입력창에 쓸 표기(스텝 자릿수에 맞춘 고정 소수점). 1 스텝이면 정수로. */
export function formatStep(value: number, step: number): string {
  return value.toFixed(stepDecimals(step))
}

/**
 * 사용자가 입력창에 친 문자열을 값으로 해석한다.
 * 빈 문자열·숫자가 아닌 입력은 null — 호출한 쪽이 "고치지 않는다"로 처리하면
 * 지우고 다시 치는 동안 값이 튀지 않는다.
 */
export function parseStepInput(
  text: string,
  min: number,
  max: number,
  step: number
): number | null {
  const t = text.trim().replace(/,/g, '.')
  if (t === '' || t === '-' || t === '.') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return clampToStep(n, min, max, step)
}
