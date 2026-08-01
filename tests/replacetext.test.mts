/**
 * 낱말 바꾸기 순수 로직 검증 — src/shared/replaceText.ts.
 *
 * 책 전체 바꾸기(§6.9)는 되돌리기가 어려운 조작이라, "찾은 만큼 정확히 바뀐다"가 전부다.
 * 찾기와 **같은 정규식**을 쓰는지, 특수문자가 든 이름에서도 글자 그대로 다루는지를 못 박는다.
 */
import assert from 'node:assert/strict'
import { escapeForRegex, replaceInText, searchRegex } from '../src/shared/replaceText'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 가장 흔한 쓰임 — 임시 이름을 진짜 이름으로
{
  const r = replaceInText('임시이름이 걸었다. 임시이름이 웃었다.', '임시이름', '유리케')
  assert.equal(r.text, '유리케이 걸었다. 유리케이 웃었다.')
  assert.equal(r.count, 2)
  ok('바꾸기: 한 문서 안의 모든 일치를 바꾸고 횟수를 센다')
}

// 2) 대소문자 — 기본은 구분 없음, 옵션을 켜면 구분
{
  assert.equal(replaceInText('Anna and anna', 'anna', 'Bella').count, 2)
  assert.equal(replaceInText('Anna and anna', 'anna', 'Bella', true).count, 1)
  assert.equal(replaceInText('Anna and anna', 'anna', 'Bella', true).text, 'Anna and Bella')
  ok('바꾸기: 대소문자 구분 옵션')
}

// 3) ★바꿀 말의 `$`는 글자다 — String.replace의 치환 패턴으로 해석되면 안 된다
{
  assert.equal(replaceInText('값은 X이다', 'X', '$&').text, '값은 $&이다')
  assert.equal(replaceInText('값은 X이다', 'X', '$1').text, '값은 $1이다')
  assert.equal(replaceInText('값은 X이다', 'X', 'a$b').text, '값은 a$b이다')
  ok('바꾸기: 바꿀 말의 $&·$1은 글자 그대로')
}

// 4) ★찾을 말의 정규식 특수문자도 글자다
{
  assert.equal(replaceInText('a.b 와 axb', 'a.b', 'Z').count, 1, '정규식 . 이 아무 글자와 맞음')
  assert.equal(replaceInText('값(1) 표시', '(1)', '[1]').text, '값[1] 표시')
  assert.equal(escapeForRegex('a.b*c'), 'a\\.b\\*c')
  ok('바꾸기: 찾을 말의 특수문자(. * ( ))는 글자 그대로')
}

// 5) 찾기와 같은 정규식을 쓴다(규칙이 갈라지면 "3건 찾았는데 2건만 바뀜"이 난다)
{
  const body = '임시이름 임시이름 임시이름'
  const found = body.match(searchRegex('임시이름'))?.length ?? 0
  assert.equal(found, replaceInText(body, '임시이름', '유리케').count)
  ok('바꾸기: 찾은 건수 = 바꾼 건수(같은 정규식)')
}

// 6) 없는 말·빈 말은 원본 그대로(파일을 건드리지 않게 count 0)
{
  assert.deepEqual(replaceInText('본문', '없는말', 'X'), { text: '본문', count: 0 })
  assert.deepEqual(replaceInText('본문', '', 'X'), { text: '본문', count: 0 })
  ok('바꾸기: 일치 없음·빈 검색어면 원본 그대로(count 0)')
}

// 7) 바꿀 말이 비면 삭제다(지우기도 정당한 쓰임)
{
  assert.deepEqual(replaceInText('군더더기 말', '군더더기 ', ''), { text: '말', count: 1 })
  ok('바꾸기: 바꿀 말이 비면 지우기')
}

// 8) 바꿀 말이 찾을 말을 품어도 무한히 늘어나지 않는다
{
  const r = replaceInText('철수', '철수', '철수철수')
  assert.equal(r.text, '철수철수')
  assert.equal(r.count, 1)
  ok('바꾸기: 바꿀 말이 찾을 말을 품어도 한 번만(무한 증식 없음)')
}

// 9) 줄바꿈을 건너 여러 줄에서 바꾼다
{
  const r = replaceInText('임시이름\n둘째 줄 임시이름\n', '임시이름', '유리케')
  assert.equal(r.text, '유리케\n둘째 줄 유리케\n')
  assert.equal(r.count, 2)
  ok('바꾸기: 여러 줄에 걸쳐 모두 바꾼다')
}

console.log(`\n✅ 낱말 바꾸기(replaceText): ${pass}개 검증 통과`)
