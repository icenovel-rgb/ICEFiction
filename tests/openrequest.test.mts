/**
 * 열람 프로토콜 파서 — `[[열람: 경로]]` 추출·정규화·상한(BLUEPRINT §7.5).
 * 실행: npx tsx tests/openrequest.test.mts
 */
import assert from 'node:assert/strict'
import {
  isOnlyOpenRequest,
  OPEN_MAX_FILES,
  parseOpenRequests,
  stripOpenRequests
} from '../src/shared/openRequest'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 기본 추출
assert.deepEqual(parseOpenRequests('[[열람: notes/설정.md]]'), ['notes/설정.md'])
assert.deepEqual(parseOpenRequests('앞말\n[[열람: a.md]]\n뒷말'), ['a.md'])
ok('한 줄 요청을 뽑는다')

// 2) 여러 개 + 공백·전각 콜론 허용
assert.deepEqual(
  parseOpenRequests('[[열람:a.md]] [[열람 : b.md]] [[열람：c.md]]'),
  ['a.md', 'b.md', 'c.md']
)
ok('공백·전각 콜론(：)을 받는다')

// 3) 중복 제거
assert.deepEqual(parseOpenRequests('[[열람: a.md]] [[열람: a.md]] [[열람: b.md]]'), ['a.md', 'b.md'])
ok('중복은 한 번만')

// 4) 상한 5개
const many = Array.from({ length: 9 }, (_, i) => `[[열람: ${i}.md]]`).join('\n')
assert.equal(parseOpenRequests(many).length, OPEN_MAX_FILES)
ok(`한 번에 최대 ${OPEN_MAX_FILES}개`)

// 5) 경로 정규화 — 역슬래시·선행 슬래시·따옴표
assert.deepEqual(parseOpenRequests('[[열람: \\notes\\a.md]]'), ['notes/a.md'])
assert.deepEqual(parseOpenRequests('[[열람: "notes/a.md"]]'), ['notes/a.md'])
ok('역슬래시·선행 슬래시·따옴표를 정규화한다')

// 6) 오탐 방지 — 위키링크 이미지·일반 대괄호는 요청이 아니다
assert.deepEqual(parseOpenRequests('![[assets/images/a.png]]'), [])
assert.deepEqual(parseOpenRequests('[[인물: 김이]]'), [])
assert.deepEqual(parseOpenRequests('열람: notes/a.md'), []) // 대괄호 없으면 요청 아님
ok('비슷하게 생긴 문법을 요청으로 오해하지 않는다')

// 7) 표시용 제거
assert.equal(stripOpenRequests('답변입니다.\n\n[[열람: a.md]]'), '답변입니다.')
assert.equal(stripOpenRequests('[[열람: a.md]]'), '')
ok('화면 표시용으로 요청 표기를 걷어낸다')

// 8) "요청만 한 응답" 판정
assert.equal(isOnlyOpenRequest('[[열람: a.md]]'), true)
assert.equal(isOnlyOpenRequest('잠시만요, 확인하겠습니다. [[열람: a.md]]'), true)
assert.equal(
  isOnlyOpenRequest(
    '주인공은 고아원에서 자랐고 스무 살에 상경했습니다. 자세한 내용은 아래 파일에 있습니다. [[열람: a.md]]'
  ),
  false
)
ok('요청만 한 응답과 답 + 요청을 구분한다')

console.log(`\n열람 프로토콜 테스트 ${pass}개 통과`)
