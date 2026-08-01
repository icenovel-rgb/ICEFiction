/**
 * AI 결과 문단 정리 검증 — src/shared/aiText.ts.
 *
 * 이 앱은 문단 사이를 **줄 아래 여백**(--paper-para-gap)으로 벌린다(§8.1). 그래서 AI가 관례대로
 * 빈 줄을 넣어 문단을 나누면 간격이 두 겹으로 붙어 원고가 두 배로 벌어진다. 받은 글을 원고에
 * 넣기 직전에 "빈 줄 → 줄바꿈 한 번"으로 맞춘다.
 */
import assert from 'node:assert/strict'
import { collapseBlankLines } from '../src/shared/aiText'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 문단 사이 빈 줄 하나 → 줄바꿈 한 번
{
  assert.equal(collapseBlankLines('첫 문단.\n\n둘째 문단.'), '첫 문단.\n둘째 문단.')
  ok('빈 줄 하나를 줄바꿈 한 번으로')
}

// 2) 빈 줄이 여러 개여도 한 번으로
{
  assert.equal(collapseBlankLines('가.\n\n\n\n나.'), '가.\n나.')
  ok('연속된 빈 줄도 한 번으로')
}

// 3) 공백·탭만 있는 줄도 빈 줄이다(모델이 흘리는 흔한 형태)
{
  assert.equal(collapseBlankLines('가.\n   \n나.'), '가.\n나.')
  assert.equal(collapseBlankLines('가.\n\t\n \n나.'), '가.\n나.')
  ok('공백·탭만 있는 줄도 빈 줄로 본다')
}

// 4) 줄바꿈 한 번은 그대로 둔다(이미 이 앱의 규칙대로 온 글)
{
  assert.equal(collapseBlankLines('가.\n나.\n다.'), '가.\n나.\n다.')
  ok('줄바꿈 한 번은 그대로')
}

// 5) ★Shift+Enter 하드 브레이크(줄 끝 공백 2칸)는 보존한다 — 사용자가 직접 시킨 줄바꿈이다
{
  assert.equal(collapseBlankLines('한 줄 더 간다  \n\n다음 문단.'), '한 줄 더 간다  \n다음 문단.')
  ok('줄 끝 공백 두 칸(하드 브레이크)은 지우지 않는다')
}

// 6) 윈도우 줄바꿈(CRLF)도 같은 결과
{
  assert.equal(collapseBlankLines('가.\r\n\r\n나.'), '가.\n나.')
  ok('CRLF도 정리된다')
}

// 7) 앞뒤 빈 줄은 걷어낸다 — 삽입 자리에 빈 줄이 먼저 들어가면 그만큼 벌어진다
{
  assert.equal(collapseBlankLines('\n\n본문.\n\n'), '본문.')
  ok('맨 앞·맨 뒤 빈 줄은 걷어낸다')
}

// 8) 두 번 돌려도 같다(멱등) — 스트리밍 중 누적본에 매번 적용하기 때문에 필수다
{
  const once = collapseBlankLines('가.\n\n나.\n\n\n다.')
  assert.equal(collapseBlankLines(once), once)
  ok('멱등 — 스트리밍 누적본에 반복 적용해도 안전')
}

// 9) ★코드 펜스 안은 건드리지 않는다 — 빈 줄이 뜻을 갖는 유일한 자리
{
  const src = '설명.\n\n```\n가\n\n나\n```\n\n끝.'
  assert.equal(collapseBlankLines(src), '설명.\n```\n가\n\n나\n```\n끝.')
  ok('코드 펜스 안의 빈 줄은 보존')
}

// 10) 빈 문자열·공백만 있는 입력
{
  assert.equal(collapseBlankLines(''), '')
  assert.equal(collapseBlankLines('   \n  \n'), '')
  ok('빈 입력은 빈 결과')
}

console.log(`\n✅ AI 문단 정리: ${pass}개 검증 통과`)
