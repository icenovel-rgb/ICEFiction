/**
 * 따옴표 모양 통일 검증 — src/shared/quoteStyle.ts.
 *
 * "같은 글꼴인데 따옴표 모양이 다르다"의 정체는 **다른 글자**다(U+0022 vs U+201C·U+201D).
 * 내장 글꼴 4종은 두 글자를 다 갖고 있으므로(fontTools 확인) 글꼴로는 못 고친다 — 글자를 바꿔야 한다.
 * 곧은 → 둥근은 여는지 닫는지를 가려야 해서, 그 판단이 이 파일의 전부다.
 */
import assert from 'node:assert/strict'
import {
  countQuotesToChange,
  normalizeQuotes,
  quoteFamilyOf,
  styledPair
} from '../src/shared/quoteStyle'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 곧은 → 둥근: 대사 한 줄의 여닫이를 제대로 가른다
{
  assert.equal(normalizeQuotes('"어서 와."', 'curly'), '“어서 와.”')
  assert.equal(normalizeQuotes("'무슨 소리지?'", 'curly'), '‘무슨 소리지?’')
  ok('곧은 → 둥근: 여는 따옴표와 닫는 따옴표를 가려 넣는다')
}

// 2) 둥근 → 곧은: 판단이 필요 없다(되돌리기)
{
  assert.equal(normalizeQuotes('“어서 와.”', 'straight'), '"어서 와."')
  assert.equal(normalizeQuotes('‘생각’', 'straight'), "'생각'")
  ok('둥근 → 곧은: 그대로 되돌린다')
}

// 3) ★섞여 있는 원고를 한쪽으로 — 이 기능의 실제 쓰임(손으로 쓴 대사 + AI가 쓴 대사)
{
  const mixed = '"손으로 쓴 대사."\n“AI가 쓴 대사.”'
  assert.equal(normalizeQuotes(mixed, 'curly'), '“손으로 쓴 대사.”\n“AI가 쓴 대사.”')
  assert.equal(normalizeQuotes(mixed, 'straight'), '"손으로 쓴 대사."\n"AI가 쓴 대사."')
  ok('섞인 원고: 어느 쪽으로든 한 모양으로 모인다')
}

// 4) 문장 안에 낀 대사 — 앞이 공백이면 여는, 글자·부호 뒤면 닫는
{
  assert.equal(normalizeQuotes('그가 "어서 와" 하고 말했다', 'curly'), '그가 “어서 와” 하고 말했다')
  ok('여닫이 판정: 앞 글자로 가른다(공백 뒤=여는, 글자 뒤=닫는)')
}

// 5) ★영문 아포스트로피는 오른쪽 작은따옴표다(활자 관례) — 여는 따옴표가 되면 안 된다
{
  assert.equal(normalizeQuotes("don't", 'curly'), 'don’t')
  assert.equal(normalizeQuotes("it's a 'word' here", 'curly'), 'it’s a ‘word’ here')
  ok('아포스트로피: 글자 사이의 \' 는 ’ 로(don’t)')
}

// 6) ★낫표는 건드리지 않는다 — 곧은/둥근이라는 축이 없는 별개 부호이고, 일부러 고른 것이다
{
  assert.equal(normalizeQuotes('「대사」 『인용』', 'curly'), '「대사」 『인용』')
  assert.equal(normalizeQuotes('「대사」', 'straight'), '「대사」')
  assert.equal(quoteFamilyOf('「'), null)
  ok('낫표(「」『』)는 통일 대상이 아니다')
}

// 7) keep이면 한 글자도 안 바꾼다(지금까지의 동작 그대로)
{
  const src = '"곧은" 과 “둥근” 이 섞임'
  assert.equal(normalizeQuotes(src, 'keep'), src)
  assert.equal(countQuotesToChange(src, 'keep'), 0)
  ok('keep: 아무것도 바꾸지 않는다')
}

// 8) 멱등 — 이미 통일된 글에 다시 걸어도 그대로
{
  const once = normalizeQuotes('"가" 나 "다"', 'curly')
  assert.equal(normalizeQuotes(once, 'curly'), once)
  assert.equal(countQuotesToChange(once, 'curly'), 0)
  ok('멱등: 통일된 글에 다시 걸어도 그대로(바꿀 것 0)')
}

// 9) 바꿀 개수를 센다(단추를 눌러도 아무 일이 없을 때를 알려 주려고)
{
  assert.equal(countQuotesToChange('"가"', 'curly'), 2)
  assert.equal(countQuotesToChange('“가”', 'curly'), 0)
  ok('개수 세기: 바뀔 글자 수를 미리 알 수 있다')
}

// 10) 자동 짝이 쓸 여닫이 짝
{
  assert.deepEqual(styledPair('double', 'curly'), { open: '“', close: '”' })
  assert.deepEqual(styledPair('double', 'straight'), { open: '"', close: '"' })
  assert.equal(styledPair('double', 'keep'), null)
  ok('자동 짝: 고른 모양의 여닫이 짝을 준다')
}

// 11) 따옴표가 없는 글·빈 글은 그대로
{
  assert.equal(normalizeQuotes('따옴표 없는 문장.', 'curly'), '따옴표 없는 문장.')
  assert.equal(normalizeQuotes('', 'curly'), '')
  ok('따옴표 없는 글·빈 글은 그대로')
}

console.log(`\n✅ 따옴표 모양 통일(quoteStyle): ${pass}개 검증 통과`)
