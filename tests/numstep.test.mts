/**
 * 수치 입력(슬라이더·직접 입력·화살표) 순수 로직 검증 — src/shared/numstep.ts.
 * 세 입력이 같은 값을 만들어야 하고, 0.1 스텝에서 부동소수점 찌꺼기가 새면 안 된다.
 *
 * 실행: npx tsx tests/numstep.test.mts
 */
import assert from 'node:assert/strict'
import {
  clampToStep,
  formatStep,
  parseStepInput,
  stepBy,
  stepDecimals
} from '../src/shared/numstep'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) ★그냥 더했다면 틀렸을 자리 — 0.7 + 0.1 은 0.7999999999999999 가 된다
{
  assert.equal(0.7 + 0.1 === 0.8, false, '전제 확인: 부동소수점 오차가 실제로 난다')
  assert.equal(stepBy(0.7, 1, 0, 2, 0.1), 0.8)
  assert.equal(stepBy(0.8, -1, 0, 2, 0.1), 0.7)
  // 0 에서 2 까지 20번 올려도 찌꺼기가 누적되지 않는다
  let v = 0
  for (let i = 0; i < 20; i += 1) v = stepBy(v, 1, 0, 2, 0.1)
  assert.equal(v, 2)
  ok('0.1 스텝 — 화살표로 올리고 내려도 오차가 새지 않는다')
}

// 2) 경계 — 최소·최대에서 더 나가지 않는다
{
  assert.equal(stepBy(0, -1, 0, 2, 0.1), 0)
  assert.equal(stepBy(2, 1, 0, 2, 0.1), 2)
  assert.equal(stepBy(13, -1, 13, 26, 1), 13)
  assert.equal(stepBy(26, 1, 13, 26, 1), 26)
  ok('경계에서 화살표는 값을 넘기지 않는다')
}

// 3) 격자 맞춤 — 슬라이더가 낼 수 없는 값을 직접 입력해도 유효한 값으로 붙는다
{
  assert.equal(clampToStep(1.73, 1.4, 2.6, 0.1), 1.7)
  assert.equal(clampToStep(1.77, 1.4, 2.6, 0.1), 1.8)
  // 0.5 스텝(들여쓰기 폭) — 가장 가까운 격자로 붙는다
  assert.equal(clampToStep(1.3, 0.5, 3, 0.5), 1.5)
  assert.equal(clampToStep(1.2, 0.5, 3, 0.5), 1)
  // 범위 밖은 잘라낸다
  assert.equal(clampToStep(99, 13, 26, 1), 26)
  assert.equal(clampToStep(-5, 13, 26, 1), 13)
  assert.equal(clampToStep(Number.NaN, 13, 26, 1), 13)
  ok('격자 맞춤 — 어긋난 값은 가장 가까운 유효 값으로')
}

// 4) 격자는 min 기준 — min 이 스텝의 배수가 아닐 때가 진짜 함정
{
  // min=1.4, step=0.1 → 1.4·1.5·1.6 … 이 유효. 1.45 는 1.4 나 1.5 로만 간다.
  assert.equal(clampToStep(1.45, 1.4, 2.6, 0.1), 1.5)
  assert.equal(clampToStep(1.44, 1.4, 2.6, 0.1), 1.4)
  // min=0.5, step=0.5 → 0.5·1.0·1.5 …
  assert.equal(clampToStep(0.7, 0.5, 3, 0.5), 0.5)
  ok('격자는 min 기준으로 잡힌다')
}

// 5) 슬라이더와 화살표가 같은 값을 만든다 — 어긋나면 눌렀다 끌 때 값이 튄다
{
  const RANGES: [min: number, max: number, step: number][] = [
    [13, 26, 1], // 글자 크기
    [1.4, 2.6, 0.1], // 줄 간격
    [0, 2, 0.1], // 문단 간격
    [0.5, 3, 0.5] // 들여쓰기 폭
  ]
  for (const [min, max, step] of RANGES) {
    let viaArrow = min
    const count = Math.round((max - min) / step)
    for (let i = 0; i < count; i += 1) viaArrow = stepBy(viaArrow, 1, min, max, step)
    // 슬라이더가 내는 값(min + n*step 을 그대로 clamp)과 일치해야 한다
    assert.equal(viaArrow, clampToStep(max, min, max, step), `${min}~${max}/${step} 불일치`)
  }
  ok('슬라이더로 끝까지 = 화살표로 끝까지 (네 구간 모두)')
}

// 6) 표기 자릿수 — 정수 스텝은 정수로, 0.1 스텝은 한 자리로
{
  assert.equal(stepDecimals(1), 0)
  assert.equal(stepDecimals(0.1), 1)
  assert.equal(stepDecimals(0.5), 1)
  assert.equal(formatStep(17, 1), '17')
  assert.equal(formatStep(1.9, 0.1), '1.9')
  assert.equal(formatStep(2, 0.1), '2.0')
  assert.equal(formatStep(0, 0.1), '0.0')
  ok('표기 — 스텝 자릿수에 맞춘 고정 소수점')
}

// 7) 입력 해석 — 지우고 다시 치는 동안 값이 튀지 않아야 한다
{
  assert.equal(parseStepInput('', 13, 26, 1), null, '빈 칸은 고치지 않는다')
  assert.equal(parseStepInput('.', 0, 2, 0.1), null, '소수점만 친 중간 상태')
  assert.equal(parseStepInput('-', 0, 2, 0.1), null)
  assert.equal(parseStepInput('abc', 13, 26, 1), null)
  assert.equal(parseStepInput('20', 13, 26, 1), 20)
  assert.equal(parseStepInput(' 18 ', 13, 26, 1), 18)
  assert.equal(parseStepInput('1,8', 1.4, 2.6, 0.1), 1.8, '한글 자판 쉼표를 소수점으로')
  assert.equal(parseStepInput('999', 13, 26, 1), 26, '범위 밖은 잘라서')
  ok('입력 해석 — 중간 상태는 null, 확정 값은 격자에 맞춰')
}

console.log(`\n수치 입력 테스트 ${pass}개 통과`)
