/**
 * 이미지 프롬프트 조립 검증 — src/shared/imagePrompt.ts
 *
 * 실측으로 알아낸 두 규칙을 **테스트로 못박는다**. 나중에 누가 프롬프트를 손봐도
 * 표지에 엉터리 글자가 다시 박히는 회귀를 막는다.
 *   ① 표지 프롬프트에 "book cover"/"title" 류가 들어가면 모델이 가짜 글자를 그린다.
 *   ② 모든 지시문에 no-writing 제약이 반드시 들어가야 한다.
 */
import assert from 'node:assert/strict'
import {
  buildInstruction,
  draftCoverPrompt,
  draftDocPrompt,
  NO_TEXT_CONSTRAINT,
  oneLinePrompt,
  positiveForbiddenWord
} from '../src/shared/imagePrompt'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) ★회귀: 표지 프롬프트가 'book cover'·'title'을 **긍정 서술로** 쓰면 안 된다
//    (긍정으로 쓰면 모델이 "A NETVEL GON" 같은 가짜 제목을 그린다 — 실측.
//     "NOT a poster"처럼 부정으로 못박는 건 안전하고, 실제로 성공한 프롬프트에 들어 있었다.)
{
  const p = draftCoverPrompt('폭우의 도시')
  const bad = positiveForbiddenWord(p)
  assert.equal(bad, null, `표지 프롬프트가 "${bad}"를 긍정으로 씀 → 모델이 글자를 그린다:\n${p}`)
  assert(/illustration/i.test(p), '표지 프롬프트가 "일러스트"로 표현되지 않음')
  ok('회귀: 표지 프롬프트에 book cover·title 긍정 사용 없음(가짜 글자 방지)')
}

// 1b) 가드 자체가 동작하는지 — 실제로 글자를 그리게 만들었던 그 문구를 잡아내야 한다
{
  assert.equal(
    positiveForbiddenWord('Book cover for a Korean crime novel titled 폭우의 도시'),
    'book cover',
    '가드가 긍정 사용을 못 잡음'
  )
  assert.equal(
    positiveForbiddenWord('wallpaper art, NOT a poster, NOT a book cover'),
    null,
    '가드가 부정 표현을 오탐'
  )
  ok('가드 검증: 긍정 사용은 잡고, 부정 표현은 통과')
}

// 2) 표지 지시문: no-writing 제약 + 상단 비우기 구도가 반드시 들어간다
{
  const ins = buildInstruction({
    destAbsPath: 'C:\\books\\폭우\\cover-art.png',
    size: '1024x1536',
    prompt: draftCoverPrompt('폭우의 도시'),
    style: '느와르, 청회색 팔레트',
    cover: true
  })
  assert(ins.includes(NO_TEXT_CONSTRAINT), '지시문에 no-writing 제약 없음')
  assert(/upper third/i.test(ins), '표지인데 제목 자리(상단) 비우기 구도 지시가 없음')
  assert(ins.includes('C:\\books\\폭우\\cover-art.png'), '저장 경로가 지시문에 없음')
  assert(ins.includes('1024x1536'), '출력 크기가 지시문에 없음')
  assert(ins.includes('느와르, 청회색 팔레트'), '스타일 바이블이 지시문에 없음')
  ok('표지 지시문: no-writing + 상단 비우기 + 경로·크기·스타일 포함')
}

// 3) 문서(캐릭터) 지시문에도 no-writing 제약은 붙지만, 상단 비우기는 붙지 않는다
{
  const ins = buildInstruction({
    destAbsPath: '/tmp/kim.png',
    size: '1024x1024',
    prompt: draftDocPrompt({ name: '김철수', type: 'character', synopsis: '전직 형사. 비를 싫어한다.' })
  })
  assert(ins.includes(NO_TEXT_CONSTRAINT), '문서 이미지 지시문에 no-writing 제약 없음')
  assert(!/upper third/i.test(ins), '문서 이미지인데 표지용 구도 지시가 붙음')
  assert(ins.includes('김철수'), '문서 이름이 프롬프트에 없음')
  assert(ins.includes('전직 형사'), '시놉시스가 프롬프트에 없음')
  ok('문서 지시문: no-writing 포함 + 표지 구도는 제외')
}

// 4) 캐릭터는 인물 사진 프롬프트로, 그 외는 분위기 일러스트로
{
  const c = draftDocPrompt({ name: '김철수', type: 'character' })
  const w = draftDocPrompt({ name: '안개 숲', type: 'world' })
  assert(/portrait/i.test(c) && /head and shoulders/i.test(c), `캐릭터 프롬프트가 인물 사진이 아님: ${c}`)
  assert(!/portrait/i.test(w), `세계관 문서인데 인물 사진 프롬프트: ${w}`)
  ok('종류별 프롬프트: 캐릭터=인물 사진 / 그 외=분위기 일러스트')
}

// 5) ★CLI에 넘기는 한 줄 프롬프트에는 줄바꿈이 없어야 한다 (cmd.exe에서 깨진다 — 실측)
{
  const one = oneLinePrompt('C:\\tmp\\instr.txt')
  assert(!one.includes('\n'), `argv 프롬프트에 줄바꿈이 있으면 Windows cmd.exe에서 깨진다: ${JSON.stringify(one)}`)
  assert(one.includes('C:\\tmp\\instr.txt'), '지시문 파일 경로가 한 줄 프롬프트에 없음')
  ok('회귀: CLI argv 프롬프트는 한 줄(줄바꿈 없음)')
}

// 6) 본문이 길어도 프롬프트가 무한정 커지지 않는다(600자 상한)
{
  const long = '가'.repeat(5000)
  const p = draftDocPrompt({ name: '아무개', type: 'character', body: long })
  assert(p.length < 1200, `본문이 그대로 다 들어감(길이 ${p.length})`)
  ok('본문 길이 상한 — 프롬프트 비대화 방지')
}

console.log(`\n✅ 이미지 프롬프트: ${pass}개 검증 통과`)
