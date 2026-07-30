/**
 * 문단 간격을 없앨 줄 판정 검증 — src/shared/paraGap.ts.
 *
 * 이 앱에서 마크다운 한 문단은 한 줄이고, 문단 간격은 **그 줄 아래 여백**으로 준다(§8.1).
 * 그래서 "간격을 없애야 하는 줄"을 고르는 일이 곧 이 기능의 전부다 —
 *  · 빈 줄(원래 원고에 있던 빈 줄이 두 배로 벌어지지 않게)
 *  · Shift+Enter로 만든 줄바꿈(줄간격만 적용)
 *  · 연속되는 대사(보기 옵션)
 */
import assert from 'node:assert/strict'
import { gapKindAt, gapKinds, hasSoftBreak, isDialogueLine, SOFT_BREAK } from '../src/shared/paraGap'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}
const L = (s: string): string[] => s.split('\n')

// ── 대사 줄 판정 ──

// 1) 따옴표·쌍따옴표·낫표로 시작하면 대사
{
  for (const line of ['"어서 와."', "'무슨 소리지?'", '「대사」', '『인용』', '“대사”', '‘생각’']) {
    assert.equal(isDialogueLine(line), true, `대사로 못 봄: ${line}`)
  }
  ok('대사 판정: " \' “ ‘ 「 『 로 시작하는 줄')
}

// 2) 들여쓴 대사(전각공백·공백)도 대사
{
  assert.equal(isDialogueLine('　"들여쓴 대사"'), true)
  assert.equal(isDialogueLine('  "공백 들여쓰기"'), true)
  ok('대사 판정: 들여쓴 대사도 대사')
}

// 3) 서술·인용·빈 줄은 대사가 아니다
{
  assert.equal(isDialogueLine('그가 말했다.'), false)
  assert.equal(isDialogueLine('> "인용 안의 대사"'), false, '인용 블록을 대사로 봄')
  assert.equal(isDialogueLine('# "제목"'), false, '제목을 대사로 봄')
  assert.equal(isDialogueLine(''), false)
  assert.equal(isDialogueLine('   '), false)
  ok('대사 판정: 서술·인용·제목·빈 줄은 대사 아님')
}

// 4) 대사 뒤에 서술이 붙어도 대사 줄이다("어서 와." 그가 말했다.)
{
  assert.equal(isDialogueLine('"어서 와." 그가 말했다.'), true)
  ok('대사 판정: 대사로 시작하면 뒤에 서술이 붙어도 대사 줄')
}

// ── Shift+Enter 줄바꿈(마크다운 표준 하드 브레이크) ──

// 5) 줄 끝 공백 2칸이 하드 브레이크 표시다
{
  assert.equal(SOFT_BREAK, '  ')
  assert.equal(hasSoftBreak('한 줄 더 간다' + SOFT_BREAK), true)
  assert.equal(hasSoftBreak('공백 한 칸 '), false, '공백 한 칸을 하드 브레이크로 봄')
  assert.equal(hasSoftBreak('공백 없음'), false)
  assert.equal(hasSoftBreak('    '), false, '빈 줄(공백만)을 하드 브레이크로 봄')
  ok('줄바꿈 표시: 내용 + 줄 끝 공백 2칸일 때만')
}

// ── 줄별 판정(gapKindAt) ──

// 6) 연속되는 대사 사이는 간격 없음, 경계(서술↔대사)는 간격 유지
{
  assert.equal(gapKindAt('"대사1"', '"대사2"'), 'dialogue', '연속 대사인데 간격이 남음')
  assert.equal(gapKindAt('"마지막 대사"', '그는 돌아섰다.'), null, '대사→서술 경계 간격이 사라짐')
  assert.equal(gapKindAt('그가 말했다.', '"대사1"'), null, '서술→대사 경계 간격이 사라짐')
  assert.equal(gapKindAt('"외톨이 대사"', null), null, '마지막 줄인데 간격이 사라짐')
  ok('줄별 판정: 대사↔대사만 간격 0, 서술 경계는 유지')
}

// 7) 빈 줄과 하드 브레이크는 옵션과 무관하게 간격 0
{
  assert.equal(gapKindAt('', '아무거나'), 'blank')
  assert.equal(gapKindAt('   ', '아무거나'), 'blank')
  assert.equal(gapKindAt('이어지는 줄' + SOFT_BREAK, '다음 줄'), 'soft')
  ok('줄별 판정: 빈 줄 → blank · 하드 브레이크 → soft')
}

// 8) 대사 줄이 Shift+Enter로 끝나면 soft가 이긴다(사용자가 직접 시킨 줄바꿈이 우선)
{
  assert.equal(gapKindAt('"대사1"' + SOFT_BREAK, '"대사2"'), 'soft')
  ok('줄별 판정: 하드 브레이크가 연속 대사보다 우선')
}

// ── 문서 전체(gapKinds) ──

// 9) ★사용자가 요구한 그림 그대로 — 서술 / 대사 셋 / 서술
{
  const kinds = gapKinds(L('비가 내렸다.\n"어서 와."\n"오래 기다렸어?"\n"아니, 방금 왔어."\n그는 우산을 접었다.'))
  assert.deepEqual(kinds, [null, 'dialogue', 'dialogue', null, null])
  ok('전체: 서술→대사 첫 줄 간격 유지 · 대사끼리 0 · 마지막 대사→서술 간격 유지')
}

// 10) 대사가 하나만 있으면 앞뒤 간격을 모두 유지한다
{
  assert.deepEqual(gapKinds(L('서술.\n"한 마디."\n서술.')), [null, null, null])
  ok('전체: 대사 한 줄뿐이면 앞뒤 간격 유지')
}

// 11) 빈 줄로 갈라 쓴 원고도 연속 대사로 본다(빈 줄은 건너뛰고 다음 내용 줄을 본다)
{
  const kinds = gapKinds(L('"대사1"\n\n"대사2"\n\n서술.'))
  assert.deepEqual(kinds, ['dialogue', 'blank', null, 'blank', null])
  ok('전체: 빈 줄로 갈라 쓴 원고도 연속 대사 인식(빈 줄은 blank)')
}

// 12) 문서 끝 처리 — 마지막 줄은 아래에 아무것도 없으니 간격 판단 대상이 아니다
{
  assert.deepEqual(gapKinds(L('"대사1"\n"대사2"')), ['dialogue', null])
  assert.deepEqual(gapKinds([]), [])
  ok('전체: 마지막 줄·빈 문서 안전')
}

console.log(`\n✅ 문단 간격 판정(paraGap): ${pass}개 검증 통과`)
