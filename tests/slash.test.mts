/**
 * 본문 슬래시 명령(§6.1b) — 명령 카탈로그·프롬프트 조립·문단 범위 계산.
 * 실행: npx tsx tests/slash.test.mts
 */
import assert from 'node:assert/strict'
import {
  BEFORE_CAP,
  beforeText,
  findCommand,
  paragraphAt,
  SLASH_COMMANDS
} from '../src/shared/slashCommands'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 카탈로그 — 모두 `/`로 시작하고, 그림 말고는 프롬프트 빌더가 있다
for (const c of SLASH_COMMANDS) {
  assert.ok(c.label.startsWith('/'), `${c.id}: 라벨이 /로 시작하지 않음`)
  assert.ok(c.detail.length > 0, `${c.id}: 설명 없음`)
  assert.ok(c.icon.length > 0, `${c.id}: 목록 아이콘 없음`)
  assert.ok(c.outcome.length > 0, `${c.id}: 결과 꼬리표 없음`)
  if (c.kind === 'image') assert.equal(c.build, undefined)
  else assert.equal(typeof c.build, 'function', `${c.id}: build 없음`)
}
assert.ok(findCommand('continue') && findCommand('image') && findCommand('polish'))
ok('명령 카탈로그 — 라벨·설명·아이콘·꼬리표·빌더 규약')

// 1b) 고스트 명령은 **고르기 전에** "Tab을 눌러야 확정된다"를 목록에서 알려야 한다(§6.1a 약속)
for (const c of SLASH_COMMANDS.filter((x) => x.kind === 'ghost')) {
  assert.ok(c.outcome.includes('Tab'), `${c.id}: 꼬리표가 Tab 확정을 알리지 않음`)
}
assert.ok(!findCommand('synopsis')!.outcome.includes('Tab'), '줄거리는 Tab 확정이 아니다')
ok('제안 명령은 목록에서 Tab 확정을 예고한다')

// 2) 이어쓰기 — 커서 직전 본문을 싣고, "본문만" 출력하라고 못박는다
const cont = findCommand('continue')!.build!({
  before: '밤이 깊어지자 그는 창을 닫았다.',
  selection: '',
  title: 'manuscript/01.md'
})
assert.ok(cont.includes('밤이 깊어지자'), '커서 직전 본문이 안 실림')
assert.ok(cont.includes('본문만'), '설명 없이 본문만 달라는 지시가 없음')
assert.ok(!cont.includes('[원문]'))
ok('/이어쓰기 — 직전 본문 + 본문만 출력 지시')

// 3) 다듬기 — 갈아끼우는 명령이고, 대상 원문이 실린다
const polish = findCommand('polish')!
assert.equal(polish.replaces, true, '/다듬기는 문단을 갈아끼워야 한다')
assert.ok(polish.build!({ before: 'x', selection: '그는 매우 슬펐다.', title: '' }).includes('그는 매우 슬펐다.'))
ok('/다듬기 — 대상 문단을 결과로 교체')

// 4) 줄거리 — 문서 정보로 가는 명령
assert.equal(findCommand('synopsis')!.kind, 'synopsis')
ok('/줄거리 — 본문이 아니라 문서 정보로')

// 5) 커서 직전 본문은 상한까지만
const long = '가'.repeat(5000)
assert.equal(beforeText(long, 5000).length, BEFORE_CAP)
assert.equal(beforeText('짧은 글', 3), '짧은 글'.slice(0, 3))
ok(`커서 직전 본문은 ${BEFORE_CAP}자까지`)

// 6) 문단 범위 — 빈 줄 사이 덩어리
const doc = '첫 문단이다.\n\n두 번째 문단이다.\n계속 이어진 줄.\n\n세 번째.'
const mid = paragraphAt(doc, doc.indexOf('계속'))!
assert.equal(doc.slice(mid.from, mid.to), '두 번째 문단이다.\n계속 이어진 줄.')
const first = paragraphAt(doc, 2)!
assert.equal(doc.slice(first.from, first.to), '첫 문단이다.')
const last = paragraphAt(doc, doc.length - 1)!
assert.equal(doc.slice(last.from, last.to), '세 번째.')
ok('문단 범위 — 처음·중간·끝 모두 정확')

// 7) 빈 줄에 커서가 있으면 대상 없음(엉뚱한 문단을 고치지 않는다)
const gap = '앞 문단\n\n\n\n뒤 문단'
assert.equal(paragraphAt(gap, 6), null, '빈 줄에서는 null')
assert.deepEqual(paragraphAt(gap, 8), { from: 8, to: 12 }, '뒤 문단 첫 글자에서는 그 문단')
assert.equal(paragraphAt('', 0), null)
ok('빈 줄에서는 대상을 잡지 않는다')

console.log(`\n슬래시 명령 테스트 ${pass}개 통과`)
