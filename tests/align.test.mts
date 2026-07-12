/**
 * 문단 정렬(선택 부분만) 순수 로직 검증 — src/shared/align.ts.
 * 파일에 실제로 기록되는 형태(<div align="…">)가 정확한지, 다시 바꾸고 해제하는 왕복이 되는지.
 */
import assert from 'node:assert/strict'
import { findAlignBlock, scanAlignBlocks, setAlign } from '../src/shared/align'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

const L = (s: string): string[] => s.split('\n')
const S = (a: string[]): string => a.join('\n')

// 1) 새로 감싸기 — 선택한 줄만 <div align="center">로, 앞뒤 빈 줄로 분리
{
  const doc = L('앞 문단\n\n가운데로 갈 줄\n\n뒤 문단')
  const r = setAlign(doc, 2, 2, 'center')
  assert.equal(
    S(r.lines),
    '앞 문단\n\n<div align="center">\n\n가운데로 갈 줄\n\n</div>\n\n뒤 문단'
  )
  // 선택은 내용 줄을 계속 가리켜야 한다(커서 복원)
  assert.equal(r.lines[r.startLine], '가운데로 갈 줄')
  assert.equal(r.startLine, r.endLine)
  ok('감싸기: <div align="center"> + 안쪽 빈 줄(마크다운 파싱 보장)')
}

// 2) 여러 줄 선택 → 통째로 한 블록
{
  const doc = L('첫 줄\n둘째 줄\n셋째 줄')
  const r = setAlign(doc, 0, 2, 'right')
  assert.equal(S(r.lines), '<div align="right">\n\n첫 줄\n둘째 줄\n셋째 줄\n\n</div>')
  assert.equal(r.endLine - r.startLine, 2)
  ok('감싸기: 여러 줄 선택 → 한 블록')
}

// 3) 이미 정렬된 블록 안에서 다른 정렬로 → 태그만 교체(중첩 금지)
{
  const doc = L('<div align="center">\n\n본문\n\n</div>')
  const r = setAlign(doc, 2, 2, 'right')
  assert.equal(S(r.lines), '<div align="right">\n\n본문\n\n</div>')
  assert.equal((S(r.lines).match(/<div/g) || []).length, 1, '중첩 발생')
  ok('변경: 이미 정렬된 블록 → 태그만 교체(중첩 없음)')
}

// 4) 해제 → 태그와 안쪽 빈 줄이 함께 사라지고 본문만 남는다
{
  const doc = L('앞\n\n<div align="center">\n\n본문\n\n</div>\n\n뒤')
  const r = setAlign(doc, 4, 4, null)
  assert.equal(S(r.lines), '앞\n\n본문\n\n뒤')
  assert.equal(r.lines[r.startLine], '본문', '해제 후 커서가 본문을 가리켜야 함')
  ok('해제: 태그·빈 줄 제거 + 커서 유지')
}

// 5) 감싸기 → 해제 왕복이 원본과 같아야 한다
{
  const original = '앞 문단\n\n본문 줄\n\n뒤 문단'
  const wrapped = setAlign(L(original), 2, 2, 'justify')
  const unwrapped = setAlign(wrapped.lines, wrapped.startLine, wrapped.endLine, null)
  assert.equal(S(unwrapped.lines), original, '왕복 후 원본과 달라짐')
  ok('왕복: 감싸기 → 해제 = 원본 복원')
}

// 6) 정렬 블록 밖의 줄은 블록으로 인식되지 않는다
{
  const doc = L('<div align="center">\n\n안\n\n</div>\n\n밖')
  assert.equal(findAlignBlock(doc, 6, 6), null, '블록 밖인데 안으로 판정')
  assert.notEqual(findAlignBlock(doc, 2, 2), null, '블록 안인데 못 찾음')
  ok('경계: 블록 밖/안 판정')
}

// 7) 문서 전체 스캔 — 여러 블록을 찾고, 짝 없는 태그는 무시
{
  const doc = L('<div align="center">\n\nA\n\n</div>\n\n보통\n\n<div align="right">\n\nB\n\n</div>')
  const blocks = scanAlignBlocks(doc)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].align, 'center')
  assert.equal(blocks[1].align, 'right')
  assert.deepEqual(scanAlignBlocks(L('<div align="center">\n\n닫히지 않음')), [], '짝 없는 태그를 블록으로 봄')
  ok('스캔: 다중 블록 + 짝 없는 태그 무시')
}

// 8) 해제할 게 없으면 그대로(무해)
{
  const doc = L('그냥 본문')
  const r = setAlign(doc, 0, 0, null)
  assert.equal(S(r.lines), '그냥 본문')
  ok('무해: 감싼 블록 없이 해제 → 변화 없음')
}

// 9) ★회귀: 커서가 빈 줄에 있으면 빈 블록을 만들면 안 된다 — 가장 가까운 문단을 감싼다
//    (실측 버그: 빈 줄에서 정렬하면 <div align> … </div> 안이 텅 빈 채로 삽입됐다)
{
  const doc = L('첫 문단\n\n가운데 갈 문단\n\n끝 문단')
  const r = setAlign(doc, 3, 3, 'center') // 3 = '가운데 갈 문단' 뒤의 빈 줄
  const out = S(r.lines)
  assert(!/<div align="center">\n\n\n/.test(out), `빈 블록이 만들어짐:\n${out}`)
  assert(
    out.includes('<div align="center">\n\n가운데 갈 문단\n\n</div>'),
    `빈 줄 커서가 가장 가까운 문단을 못 감쌈:\n${out}`
  )
  assert.equal(r.lines[r.startLine], '가운데 갈 문단')
  ok('회귀: 빈 줄 커서 → 빈 블록 대신 가장 가까운 문단을 감쌈')
}

// 10) 커서만 찍어도(선택 없음) 그 문단 전체가 감싸진다
{
  const doc = L('앞\n\n본문 한 줄\n\n뒤')
  const r = setAlign(doc, 2, 2, 'right')
  assert(S(r.lines).includes('<div align="right">\n\n본문 한 줄\n\n</div>'))
  ok('커서만: 그 문단 전체를 감쌈')
}

// 11) 문단 일부만 드래그해도 문단 전체가 감싸진다(여러 줄짜리 문단)
{
  const doc = L('앞\n\n첫 줄\n둘째 줄\n셋째 줄\n\n뒤')
  const r = setAlign(doc, 3, 3, 'center') // '둘째 줄'만 선택
  assert(
    S(r.lines).includes('<div align="center">\n\n첫 줄\n둘째 줄\n셋째 줄\n\n</div>'),
    `문단 일부 선택이 문단 전체로 안 넓혀짐:\n${S(r.lines)}`
  )
  ok('부분 선택: 문단 경계까지 넓혀서 감쌈(문단 중간에서 안 끊김)')
}

// 12) 여러 문단을 걸쳐 선택하면 통째로 한 블록
{
  const doc = L('A 문단\n\nB 문단\n\nC 문단')
  const r = setAlign(doc, 0, 2, 'center')
  assert(
    S(r.lines).includes('<div align="center">\n\nA 문단\n\nB 문단\n\n</div>'),
    `여러 문단 선택 처리 이상:\n${S(r.lines)}`
  )
  assert(S(r.lines).includes('C 문단'))
  ok('여러 문단 선택: 통째로 한 블록')
}

// 13) 빈 문서에서 정렬 → 아무 일도 없어야 한다(빈 블록 금지)
{
  const doc = L('\n\n')
  const r = setAlign(doc, 0, 0, 'center')
  assert(!S(r.lines).includes('<div'), `빈 문서에 빈 정렬 블록이 생김:\n${S(r.lines)}`)
  ok('빈 문서: 정렬해도 빈 블록을 만들지 않음')
}

console.log(`\n✅ 문단 정렬(align): ${pass}개 검증 통과`)
