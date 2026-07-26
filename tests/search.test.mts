/**
 * searchAll 스모크 — 책 전체 검색(§6.9). 오프셋 정확성이 생명이다:
 * from/to는 에디터 selection에 그대로 들어가므로 body.slice(from,to) === 검색어여야 한다.
 * 실행: npm test  (tsx로 직접 구동, electron 불필요)
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(join(tmpdir(), 'icefic-search-'))
  const svc = new ProjectService()
  await svc.create(root, '검색테스트')

  // 픽스처 — 씨앗 챕터(01-첫-장.md)에 더해 섹션 곳곳에 문서를 심는다.
  await fs.writeFile(
    join(root, 'manuscript', '02-폭풍.md'),
    ['---', 'type: chapter', 'title: 폭풍 전야', '---', '바람이 분다.', '', '유리케 공주가 창밖을 본다.', '유리케는 말이 없다.'].join('\n')
  )
  await fs.mkdir(join(root, 'manuscript', '2부'), { recursive: true })
  await fs.writeFile(
    join(root, 'manuscript', '2부', '11-귀환.md'),
    ['---', 'type: chapter', 'title: 귀환', '---', '유리케가 돌아왔다.'].join('\n')
  )
  await fs.writeFile(
    join(root, 'characters', '유리케.md'),
    ['---', 'type: character', 'title: 유리케', 'synopsis: 몰락 왕국의 공주', '---', '은발. 과묵하다.'].join('\n')
  )
  await fs.writeFile(
    join(root, 'notes', '메모.md'),
    ['---', 'type: note', 'title: 구상 (1.5+2)?', '---', '결말 후보: (1.5+2)? 두 갈래.'].join('\n')
  )
  // 숨김 파일은 검색에서 제외돼야 한다(스캔 규칙과 동일).
  await fs.writeFile(join(root, 'notes', '.숨김.md'), '유리케 유리케 유리케')

  // 1) 본문 부분일치 + from/to 오프셋 정확성(body.slice 재검증)
  const r1 = await svc.searchAll('유리케')
  const storm = r1.files.find((f) => f.path === 'manuscript/02-폭풍.md')
  assert(storm, '02-폭풍.md 미검출')
  assert.equal(storm.matches.length, 2)
  const doc = await svc.readDoc('manuscript/02-폭풍.md')
  for (const m of storm.matches) {
    assert.equal(doc.body.slice(m.from, m.to), '유리케', `오프셋 어긋남: ${m.from}-${m.to}`)
  }
  ok('본문 매치 + from/to가 body 오프셋과 정확히 일치')

  // 2) 프론트매터는 검색 대상이 아니다 — synopsis에만 있는 단어는 안 걸린다
  const r2 = await svc.searchAll('몰락 왕국')
  assert.equal(r2.files.length, 0, '프론트매터가 검색에 포함됨')
  ok('프론트매터(시놉시스 등) 제외')

  // 3) 제목 매치 — 본문에 없어도 titleMatch로 걸린다 + 하위 폴더 재귀
  const r3 = await svc.searchAll('귀환')
  const ret = r3.files.find((f) => f.path === 'manuscript/2부/11-귀환.md')
  assert(ret, '하위 폴더 문서 미검출')
  assert.equal(ret.titleMatch, true)
  ok('제목 매치(titleMatch) + 하위 폴더 재귀')

  // 4) 여러 섹션에서 걸리고 섹션 라벨이 붙는다 + 숨김 파일 제외
  const sections = new Set(r1.files.map((f) => f.section))
  assert(sections.has('manuscript') && sections.has('characters'))
  assert(!r1.files.some((f) => f.path.includes('.숨김')), '숨김 파일이 결과에 포함됨')
  ok('여러 섹션 검색 + 숨김 파일 제외')

  // 5) 줄 번호 — "유리케 공주"는 본문 3번째 줄(1:바람, 2:빈 줄, 3:공주)
  const first = storm.matches[0]
  assert.equal(first.line, 3, `줄 번호 오계산: ${first.line}`)
  ok('줄 번호 정확(빈 줄 포함 계산)')

  // 6) 미리보기 하이라이트 — preview.slice(previewFrom, previewTo) === 검색어
  for (const f of r1.files) {
    for (const m of f.matches) {
      assert.equal(m.preview.slice(m.previewFrom, m.previewTo), '유리케')
    }
  }
  ok('preview 안 하이라이트 위치 정확')

  // 7) 대소문자 — 기본 무시, caseSensitive 옵션이면 구분
  await fs.writeFile(
    join(root, 'notes', 'eng.md'),
    ['---', 'type: note', 'title: 영문', '---', 'Alice met ALICE and alice.'].join('\n')
  )
  const ci = await svc.searchAll('alice')
  assert.equal(ci.files.find((f) => f.path === 'notes/eng.md')?.matches.length, 3)
  const cs = await svc.searchAll('alice', { caseSensitive: true })
  assert.equal(cs.files.find((f) => f.path === 'notes/eng.md')?.matches.length, 1)
  ok('대소문자: 기본 무시 / caseSensitive 구분')

  // 8) 정규식 특수문자는 문자 그대로 — "(1.5+2)?"가 제목과 본문에서 그대로 걸린다
  const r8 = await svc.searchAll('(1.5+2)?')
  const memo = r8.files.find((f) => f.path === 'notes/메모.md')
  assert(memo, '특수문자 검색 실패')
  assert.equal(memo.titleMatch, true)
  assert.equal(memo.matches.length, 1)
  assert.equal((await svc.readDoc('notes/메모.md')).body.slice(memo.matches[0].from, memo.matches[0].to), '(1.5+2)?')
  ok('정규식 특수문자를 리터럴로 검색')

  // 9) 파일당 상한(50) — 60번 등장시키면 50개 + truncated
  await fs.writeFile(
    join(root, 'notes', '반복.md'),
    ['---', 'type: note', 'title: 반복', '---', Array(60).fill('까마귀').join(' ')].join('\n')
  )
  const r9 = await svc.searchAll('까마귀')
  const rep = r9.files.find((f) => f.path === 'notes/반복.md')
  assert.equal(rep?.matches.length, 50)
  assert.equal(rep?.truncated, true)
  ok('파일당 상한 50 + truncated 플래그')

  // 10) 빈/공백 검색어 → 빈 결과(스캔 안 함)
  const r10 = await svc.searchAll('   ')
  assert.equal(r10.files.length, 0)
  assert.equal(r10.totalMatches, 0)
  ok('빈 검색어는 빈 결과')

  await fs.rm(root, { recursive: true, force: true })
  console.log(`✅ searchAll: ${pass}개 검증 통과`)
}

main().catch((err) => {
  console.error('❌ 실패:', err)
  process.exit(1)
})
