/**
 * 입력 도우미 순수 로직 검증 — src/shared/quotePair.ts · src/shared/dash.ts.
 *
 * 대사·생각 부호 자동 짝(§6.1c)과 줄 앞 `--` → 불릿(•) 변환은 **키 입력마다** 돌아가는 판단이라,
 * CodeMirror 없이 문자열만으로 검증할 수 있게 순수 함수로 떼어 뒀다.
 */
import assert from 'node:assert/strict'
import { emptyQuotePair, quoteAction, quoteExitLen } from '../src/shared/quotePair'
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

// ── Enter로 따옴표 밖으로(§6.1c) ──
// 짝을 자동으로 넣어 줬으니 닫을 때도 손이 덜 가야 한다. 커서 **뒤에 닫는 부호만** 남았다면
// Enter 한 번이 그 부호를 건너뛰고 다음 줄로 내려간다(닫는 따옴표를 또 치지 않는다).

// 16) 대사를 다 쓰고 Enter — 닫는 부호 하나를 건너뛴다
{
  assert.equal(quoteExitLen('"어서 와.', '"'), 1)
  assert.equal(quoteExitLen('“어서 와.', '”'), 1)
  assert.equal(quoteExitLen('「대사', '」'), 1)
  ok('따옴표 탈출: 커서 뒤가 닫는 부호 하나면 1칸 건너뛴다')
}

// 17) 겹친 부호도 통째로 벗어난다("그가 「말」" 안쪽에서 Enter)
{
  assert.equal(quoteExitLen('"그가 「말', '」"'), 2)
  ok('따옴표 탈출: 겹친 부호는 함께 건너뛴다')
}

// 18) 들여쓴 대사(전각공백)에서도 연다 — 여는 부호를 줄 앞에서 찾을 수 있어야 한다
{
  assert.equal(quoteExitLen('　"들여쓴 대사', '"'), 1)
  ok('따옴표 탈출: 들여쓴 대사에서도 동작')
}

// 19) 뒤에 글이 남아 있으면 손대지 않는다 — 줄 중간의 Enter는 평소대로 줄을 가른다
{
  assert.equal(quoteExitLen('"어서 와.', '" 그가 말했다.'), 0)
  assert.equal(quoteExitLen('"어서 와.', '"  '), 0, '줄 끝 공백까지 삼킴(하드 브레이크 오염)')
  ok('따옴표 탈출: 닫는 부호 뒤에 글·공백이 있으면 개입하지 않는다')
}

// 20) 여는 부호가 앞에 없으면 짝이 아니다 — 홀로 떠 있는 부호를 건너뛰지 않는다
{
  assert.equal(quoteExitLen('그냥 문장', '"'), 0)
  assert.equal(quoteExitLen('「낫표만 열었다', '"'), 0, '다른 계열 부호를 짝으로 봄')
  ok('따옴표 탈출: 여는 짝이 줄 앞에 없으면 개입하지 않는다')
}

// 21) 줄 끝(뒤가 비었거나 부호가 아니면) 평소 Enter
{
  assert.equal(quoteExitLen('"어서 와."', ''), 0)
  assert.equal(quoteExitLen('서술 문장', ''), 0)
  ok('따옴표 탈출: 커서 뒤가 비면 평소 Enter')
}

// ── 따옴표 모양 통일과 자동 짝(§6.1c) ──
// 자판에는 곧은 `"` 하나뿐이다. 둥근 따옴표로 쓰기로 했다면 그 키로 둥근 여닫이를 다 만들어야 한다.

// 22) 둥근으로 정하면 곧은 키를 쳐도 둥근 짝이 들어간다
{
  assert.deepEqual(quoteAction('"', '', '', false, 'curly'), {
    kind: 'pair',
    open: '“',
    close: '”'
  })
  assert.deepEqual(quoteAction("'", '', '', false, 'curly'), {
    kind: 'pair',
    open: '‘',
    close: '’'
  })
  ok('모양 통일: 곧은 키 → 둥근 짝')
}

// 23) 닫을 때도 곧은 키로 둥근 닫는 부호를 건너뛴다(안 그러면 `”"`가 된다)
{
  assert.deepEqual(quoteAction('"', '', '”', false, 'curly'), { kind: 'skip', close: '”' })
  ok('모양 통일: 곧은 키로 둥근 닫는 부호 건너뛰기')
}

// 24) 곧은으로 정하면 둥근 키를 쳐도 곧은 짝이 들어간다(되돌리기 방향)
{
  assert.deepEqual(quoteAction('“', '', '', false, 'straight'), {
    kind: 'pair',
    open: '"',
    close: '"'
  })
  ok('모양 통일: 둥근 키 → 곧은 짝')
}

// 25) 고른 글 감싸기도 고른 모양으로
{
  assert.deepEqual(quoteAction('"', '', '', true, 'curly'), { kind: 'wrap', open: '“', close: '”' })
  ok('모양 통일: 감싸기도 고른 모양으로')
}

// 26) 낫표는 모양 축이 없어 통일 대상이 아니다 — 친 그대로
{
  assert.deepEqual(quoteAction('「', '', '', false, 'curly'), {
    kind: 'pair',
    open: '「',
    close: '」'
  })
  ok('모양 통일: 낫표는 그대로')
}

// 27) keep이면 지금까지와 똑같다(기본값이 동작을 바꾸지 않는다)
{
  assert.deepEqual(quoteAction('"', '', '', false, 'keep'), quoteAction('"', '', '', false))
  assert.equal(quoteAction('가', '', '', false, 'curly'), null, '따옴표가 아닌 글자에 개입')
  ok('모양 통일: keep은 지금까지의 동작 그대로')
}

console.log(`\n✅ 입력 도우미(자동 짝·불릿·따옴표 탈출·모양 통일): ${pass}개 검증 통과`)
