/**
 * 원고 아래 여백(§8.2) 순수 로직 검증 — src/shared/bottomPad.ts.
 *
 * 이 값은 두 곳에서 쓰인다. ① CSS 여백(문서 끝에서 더 스크롤되는 빈자리)
 * ② CM6 scrollMargins(타이핑 중 커서가 바닥에 붙지 않게). 두 곳이 **같은 수**를 봐야
 * "설정한 만큼" 떨어진다 — 그래서 계산을 한 군데 순수 함수로 모은다.
 *
 * 실행: npx tsx tests/bottompad.test.mts
 */
import assert from 'node:assert/strict'
import {
  BOTTOM_PAD_MAX,
  BOTTOM_PAD_MIN,
  bottomPadCss,
  bottomPadPx,
  clampBottomPad
} from '../src/shared/bottomPad'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 범위 — 설정 UI가 아닌 곳(옛 설정 파일·손으로 고친 값)에서 들어와도 안전해야 한다
{
  assert.equal(clampBottomPad(30), 30)
  assert.equal(clampBottomPad(BOTTOM_PAD_MIN - 10), BOTTOM_PAD_MIN)
  assert.equal(clampBottomPad(BOTTOM_PAD_MAX + 10), BOTTOM_PAD_MAX)
  assert.equal(clampBottomPad(0), 0, '0은 유효한 값이다 — 예전처럼 바닥에 붙이겠다는 뜻')
  ok('범위를 벗어난 값은 최소·최대로 붙는다 (0도 유효)')
}

// 2) 숫자가 아닌 값 — 저장된 설정이 깨졌을 때 화면이 무너지면 안 된다
{
  assert.equal(clampBottomPad(NaN), 0)
  assert.equal(clampBottomPad(Infinity), BOTTOM_PAD_MAX)
  assert.equal(clampBottomPad(undefined as unknown as number), 0)
  assert.equal(clampBottomPad(null as unknown as number), 0)
  assert.equal(clampBottomPad('30' as unknown as number), 0, '문자열은 받지 않는다')
  ok('NaN·undefined·문자열이 와도 0으로 떨어진다')
}

// 3) %→px — 화면 높이에 비례한다(창을 키우면 여백도 같이 커진다)
{
  assert.equal(bottomPadPx(30, 1000), 300)
  assert.equal(bottomPadPx(30, 900), 270)
  assert.equal(bottomPadPx(30, 1400), 420)
  assert.equal(bottomPadPx(0, 1000), 0)
  ok('화면 높이의 %로 계산된다 (900→270, 1400→420)')
}

// 4) ★여백이 화면을 다 먹으면 안 된다 — 위쪽에 최소한 이만큼은 글이 남아야 한다
{
  // 60%를 줘도 화면 높이의 60%까지만. 그 이상은 설정에서 못 고르지만 계산도 막는다.
  assert.equal(bottomPadPx(BOTTOM_PAD_MAX + 40, 1000), 600)
  // 창이 아주 작을 때(예: 300px)도 여백이 화면을 밀어내지 않는다
  assert.ok(bottomPadPx(60, 300) < 300, '여백이 화면 전체를 차지하지 않는다')
  ok('상한을 넘겨도 화면 높이의 60%를 넘지 않는다')
}

// 5) 픽셀은 정수로 — CM6 scrollMargins에 소수가 들어가면 스크롤이 1px씩 떨린다
{
  assert.equal(bottomPadPx(33, 1000), 330)
  assert.equal(Number.isInteger(bottomPadPx(37, 903)), true)
  assert.equal(Number.isInteger(bottomPadPx(7, 1081)), true)
  ok('px는 항상 정수로 나온다')
}

// 6) CSS 값 — 화면 높이 기준이므로 vh 로 낸다(창 크기가 바뀌어도 CSS가 알아서 따라간다)
{
  assert.equal(bottomPadCss(30), '30vh')
  assert.equal(bottomPadCss(0), '0px', '0은 vh가 아니라 0px — 브라우저마다 0vh 처리가 달라진다')
  assert.equal(bottomPadCss(BOTTOM_PAD_MAX + 10), `${BOTTOM_PAD_MAX}vh`)
  assert.equal(bottomPadCss(NaN), '0px')
  ok('CSS는 vh 문자열, 0이면 0px')
}

// 7) 두 소비자가 같은 수를 본다 — CSS(vh)와 scrollMargins(px)가 어긋나면 안 된다
{
  const viewport = 1000
  const pct = 30
  const cssVh = Number(bottomPadCss(pct).replace('vh', ''))
  assert.equal((cssVh / 100) * viewport, bottomPadPx(pct, viewport))
  ok('CSS 여백과 커서 여백이 같은 값을 가리킨다')
}

console.log(`\n✅ 원고 아래 여백(bottomPad): ${pass}개 검증 통과`)
