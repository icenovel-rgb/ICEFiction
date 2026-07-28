/**
 * 버전 비교(§9.1) — 업데이트 알림의 정확성이 여기 달려 있다.
 * 실행: npx tsx tests/version.test.mts
 */
import assert from 'node:assert/strict'
import { compareVersions } from '../src/shared/version'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) ★문자열 비교였다면 틀렸을 자리 — "0.10.0" < "0.9.0" (1 < 9)
{
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0, '0.10.0이 0.9.0보다 높아야 한다')
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0)
  assert.ok(compareVersions('1.0.0', '0.99.99') > 0)
  assert.ok(compareVersions('0.2.10', '0.2.9') > 0)
  ok('두 자리 마디 — 0.10.0 > 0.9.0 (문자열 비교 회귀 방지)')
}

// 2) 같으면 0 — 최신을 쓰는 사람에게 알림이 뜨면 안 된다
{
  assert.equal(compareVersions('0.10.0', '0.10.0'), 0)
  assert.equal(compareVersions('v0.10.0', '0.10.0'), 0, 'v 접두사는 무시')
  assert.equal(compareVersions('0.10.0', '0.10.0-beta.1'), 0, '꼬리표는 무시')
  ok('같은 버전 — v 접두사·꼬리표 무시')
}

// 3) 마디 수가 달라도 안전
{
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  assert.ok(compareVersions('1.0.1', '1.0') > 0)
  ok('마디 수가 달라도 비교된다')
}

// 4) 이상한 값이 와도 터지지 않는다(GitHub 태그를 그대로 받으므로 방어)
{
  assert.equal(compareVersions('', ''), 0)
  assert.equal(compareVersions('abc', 'abc'), 0)
  assert.ok(compareVersions('1.0.0', 'abc') > 0)
  ok('빈 값·비숫자에도 예외 없음')
}

console.log(`\n버전 비교 테스트 ${pass}개 통과`)
