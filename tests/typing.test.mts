/**
 * 입력 도우미 순수 로직 검증 — src/shared/quotePair.ts · src/shared/dash.ts.
 *
 * 대사·생각 부호 자동 짝(§6.1c)과 줄 앞 `--` → 불릿(•) 변환은 **키 입력마다** 돌아가는 판단이라,
 * CodeMirror 없이 문자열만으로 검증할 수 있게 순수 함수로 떼어 뒀다.
 */
import assert from 'node:assert/strict'
import { emptyQuotePair, quoteAction } from '../src/shared/quotePair'
import { BULLET, dashRewrite } from '../src/shared/dash'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// ── 자동 짝 넣기 ──

// 1) 줄 맨 앞에서 쌍따옴표 → 짝을 넣고 커서를 안으로
{
  const a = quoteAction('"', '', '', false)
  assert.deepEqual(a, { kind: 'pair', open: '"', close: '"' })
  ok('자동 짝: 줄 맨 앞 " → ""(커서 안)')
}

// 2) 공백·전각공백·문장부호 뒤에서도 짝을 넣는다(대사가 시작되는 자리)
{
  for (const before of [' ', '　', '.', ',', '?', ')']) {
    const a = quoteAction('"', before, '', false)
    assert.equal(a?.kind, 'pair', `'${before}' 뒤에서 짝이 안 생김`)
  }
  ok('자동 짝: 공백·전각공백·문장부호 뒤 → 짝 생성')
}

// 3) ★글자 바로 뒤에서는 짝을 넣지 않는다 — 영문 아포스트로피(don't)와 한글 뒤 부호를 지킨다
{
  assert.equal(quoteAction("'", 'n', '', false), null, "don't의 아포스트로피가 짝이 됨")
  assert.equal(quoteAction('"', '다', '', false), null, '한글 바로 뒤에서 짝이 생김')
  assert.equal(quoteAction('"', '7', '', false), null, '숫자 바로 뒤에서 짝이 생김')
  ok('자동 짝: 글자·숫자 바로 뒤에서는 한 글자만(아포스트로피 보호)')
}

// 4) 뒤에 글자가 있으면 짝을 넣지 않는다 — 기존 문장 앞에 부호만 덧붙이는 경우
{
  assert.equal(quoteAction('"', '', '안', false), null, '뒤에 글자가 있는데 짝이 생김')
  ok('자동 짝: 뒤에 글자가 붙어 있으면 한 글자만(기존 문장 감싸기 수동 지원)')
}

// 5) 닫는 짝 앞에서 같은 부호를 치면 **건너뛴다**(짝이 두 번 생기지 않게)
{
  assert.deepEqual(quoteAction('"', '요', '"', false), { kind: 'skip', close: '"' })
  assert.deepEqual(quoteAction('’', '각', '’', false), { kind: 'skip', close: '’' })
  assert.deepEqual(quoteAction('」', '사', '」', false), { kind: 'skip', close: '」' })
  ok('자동 짝: 닫는 짝 앞에서 같은 부호 → 건너뛰기')
}

// 6) 선택한 글이 있으면 감싼다
{
  assert.deepEqual(quoteAction('"', '가', '요', true), { kind: 'wrap', open: '"', close: '"' })
  ok('자동 짝: 선택 상태 → 통째로 감싸기')
}

// 7) 홀낫표·낫표도 짝이 맞는다(여는 부호와 닫는 부호가 다른 경우)
{
  assert.deepEqual(quoteAction('「', ' ', '', false), { kind: 'pair', open: '「', close: '」' })
  assert.deepEqual(quoteAction('『', ' ', '', false), { kind: 'pair', open: '『', close: '』' })
  assert.deepEqual(quoteAction('“', ' ', '', false), { kind: 'pair', open: '“', close: '”' })
  ok('자동 짝: 「」 『』 “” — 여는·닫는 부호가 다른 짝')
}

// 8) 우리가 다루는 부호가 아니면 손대지 않는다
{
  for (const ch of ['가', 'a', '(', '-', ' ', '\n']) {
    assert.equal(quoteAction(ch, '', '', false), null, `'${ch}'를 부호로 오인`)
  }
  ok('자동 짝: 따옴표 계열이 아니면 개입하지 않음')
}

// 9) 빈 짝 판정 — Backspace 한 번에 둘 다 지우기 위한 근거
{
  assert.equal(emptyQuotePair('"', '"'), true)
  assert.equal(emptyQuotePair('「', '」'), true)
  assert.equal(emptyQuotePair('“', '”'), true)
  assert.equal(emptyQuotePair('"', '안'), false)
  assert.equal(emptyQuotePair('"', "'"), false, '짝이 아닌 조합을 빈 짝으로 봄')
  assert.equal(emptyQuotePair('」', '「'), false, '뒤집힌 짝을 빈 짝으로 봄')
  assert.equal(emptyQuotePair('', ''), false)
  ok('빈 짝: 여는 부호 + 그 짝이 붙어 있을 때만 true')
}

// ── 줄 앞 `--` → 불릿(•) ──

// 10) 줄 앞에서 `-`를 두 번째로 치면 불릿으로 바뀐다(사용자 요청: 파일에도 • 로 기록)
{
  assert.deepEqual(dashRewrite('-', '', '-'), { back: 1, insert: BULLET })
  assert.equal(BULLET, '• ')
  ok('불릿: 줄 앞 `--` → `• `(파일에도 • 기록)')
}

// 11) 들여쓴 줄(전각공백·공백)에서도 동작하고 들여쓰기는 보존된다
{
  assert.deepEqual(dashRewrite('　-', '', '-'), { back: 1, insert: BULLET })
  assert.deepEqual(dashRewrite('   -', '', '-'), { back: 1, insert: BULLET })
  ok('불릿: 들여쓴 줄에서도 변환(들여쓰기 보존)')
}

// 12) ★구분선(---)을 계속 쓸 수 있어야 한다 — 세 번째 `-`는 `• `를 `---`로 되돌린다
{
  assert.deepEqual(dashRewrite('• ', '', '-'), { back: 2, insert: '---' })
  assert.deepEqual(dashRewrite('　• ', '', '-'), { back: 2, insert: '---' })
  ok('불릿: 세 번째 `-` → `---`(가로 구분선을 잃지 않는다)')
}

// 13) 줄 앞이 아니면(글 뒤) 손대지 않는다 — 본문 속 줄표 `--`는 그대로
{
  assert.equal(dashRewrite('그가 말했다 -', '', '-'), null, '본문 속 줄표가 불릿이 됨')
  assert.equal(dashRewrite('가-', '', '-'), null)
  ok('불릿: 본문 속 `--`(줄표)는 건드리지 않음')
}

// 14) 줄 끝이 아니면(뒤에 글이 남아 있으면) 손대지 않는다 — 이미 쓴 줄 앞에서 커서만 놀릴 때
{
  assert.equal(dashRewrite('-', '이미 쓴 글', '-'), null, '줄 중간에서 변환됨')
  assert.equal(dashRewrite('• ', '항목', '-'), null, '이미 있는 불릿 줄이 구분선으로 바뀜')
  ok('불릿: 줄 끝에서만 변환(쓰던 줄을 망치지 않음)')
}

// 15) `-` 말고 다른 글자는 무관
{
  assert.equal(dashRewrite('-', '', 'a'), null)
  assert.equal(dashRewrite('-', '', ' '), null)
  assert.equal(dashRewrite('', '', '-'), null, '첫 `-` 하나만으로 변환됨')
  ok('불릿: 첫 `-` 하나·다른 글자는 그대로')
}

console.log(`\n✅ 입력 도우미(자동 짝·불릿): ${pass}개 검증 통과`)
