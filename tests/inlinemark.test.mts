/**
 * 굵게·기울임·밑줄 토글 검증 — src/shared/inlineMark.ts (Ctrl+B / Ctrl+I / Ctrl+U).
 *
 * 마크다운에는 밑줄이 없어 표준 HTML <u>를 쓴다(정렬을 <div align>으로 쓰는 것과 같은 이유 — §6.11).
 * 겹칠 때가 함정이다: `**굵게**` 안쪽에 기울임을 걸면 굵게 마커를 갉아먹지 말고 `***굵게***`가 돼야 한다.
 */
import assert from 'node:assert/strict'
import { BOLD, ITALIC, toggleMark, UNDERLINE } from '../src/shared/inlineMark'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

/** 편집 결과를 문서 문자열과 선택 구간으로 되돌려 준다(읽기 쉬운 단정을 위해). */
function apply(
  text: string,
  from: number,
  to: number,
  style: Parameters<typeof toggleMark>[3]
): { doc: string; sel: string; anchor: number } {
  const e = toggleMark(text, from, to, style)
  const doc = text.slice(0, e.from) + e.insert + text.slice(e.to)
  return { doc, sel: doc.slice(e.anchor, e.head), anchor: e.anchor }
}

// 1) 선택 없이 누르면 짝을 넣고 커서를 안으로 — 이제부터 굵게 쓴다
{
  const r = apply('', 0, 0, BOLD)
  assert.equal(r.doc, '****')
  assert.equal(r.anchor, 2, '커서가 마커 안에 놓이지 않음')
  assert.equal(r.sel, '')
  ok('빈 커서: **|** (이제부터 굵게)')
}

// 2) 선택을 감싼다 — 선택은 안쪽 글을 계속 가리킨다
{
  const r = apply('그가 말했다', 0, 2, BOLD)
  assert.equal(r.doc, '**그가** 말했다')
  assert.equal(r.sel, '그가', '감싼 뒤 선택이 어긋남')
  ok('감싸기: 선택 → **선택** (선택 유지)')
}

// 3) 같은 단축키를 다시 누르면 해제된다(안쪽만 선택된 상태)
{
  const r = apply('**그가** 말했다', 2, 4, BOLD)
  assert.equal(r.doc, '그가 말했다')
  assert.equal(r.sel, '그가')
  ok('해제: **선택** 안쪽에서 다시 누르면 마커 제거')
}

// 4) 마커까지 통째로 선택한 상태에서도 해제된다
{
  const r = apply('**그가** 말했다', 0, 6, BOLD) // 0~6 = **그가**
  assert.equal(r.doc, '그가 말했다')
  assert.equal(r.sel, '그가')
  ok('해제: 마커 포함해 선택해도 제거')
}

// 5) 기울임도 같은 규칙
{
  assert.equal(apply('바람', 0, 2, ITALIC).doc, '*바람*')
  assert.equal(apply('*바람*', 1, 3, ITALIC).doc, '바람')
  ok('기울임: *선택* 감싸기·해제')
}

// 6) ★회귀: 굵은 글 안쪽에 기울임 → 굵게 마커를 갉아먹지 말고 ***…***
{
  const r = apply('**굵게**', 2, 4, ITALIC) // 2~4 = 굵게(마커 안쪽만)
  assert.equal(r.doc, '***굵게***', `굵게+기울임 겹치기 실패: ${r.doc}`)
  assert.equal(r.sel, '굵게')
  ok('회귀: **굵게** 안쪽 기울임 → ***굵게*** (마커 갉아먹지 않음)')
}

// 7) ★회귀: `**굵게**`를 통째로 선택하고 기울임 → 굵게를 해제해 버리면 안 된다
{
  const r = apply('**굵게**', 0, 6, ITALIC) // 마커까지 통째로
  assert.equal(r.doc, '***굵게***', `통째 선택 기울임이 굵게를 해제함: ${r.doc}`)
  ok('회귀: **굵게** 통째 선택 + 기울임 → 굵게 유지')
}

// 8) 굵게와 기울임이 겹친 글에서 굵게만 해제
{
  const r = apply('***둘 다***', 3, 6, BOLD) // 3~6 = '둘 다'
  assert.equal(r.doc, '*둘 다*', `겹친 상태에서 굵게 해제 실패: ${r.doc}`)
  ok('겹치기: ***둘 다*** 에서 굵게만 해제 → *둘 다*')
}

// 9) 밑줄은 HTML <u>로 — 마크다운에 밑줄 문법이 없다
{
  const r = apply('강조할 말', 0, 5, UNDERLINE)
  assert.equal(r.doc, '<u>강조할 말</u>')
  assert.equal(r.sel, '강조할 말')
  ok('밑줄: 선택 → <u>선택</u>')
}

// 10) 밑줄 해제(안쪽 선택 · 통째 선택 둘 다)
{
  assert.equal(apply('<u>밑줄</u>', 3, 5, UNDERLINE).doc, '밑줄')
  assert.equal(apply('<u>밑줄</u>', 0, 9, UNDERLINE).doc, '밑줄')
  ok('밑줄: 해제 왕복')
}

// 11) 여러 줄을 선택해도 통째로 감싼다(문단을 넘겨도 마커가 깨지지 않게)
{
  const r = apply('첫 줄\n둘째 줄', 0, 8, UNDERLINE)
  assert.equal(r.doc, '<u>첫 줄\n둘째 줄</u>')
  ok('여러 줄: 선택 전체를 한 번에 감쌈')
}

// 12) 감싸기 → 해제 왕복이 원본과 같아야 한다
{
  for (const style of [BOLD, ITALIC, UNDERLINE]) {
    const wrapped = toggleMark('본문', 0, 2, style)
    const doc = wrapped.insert
    const back = apply(doc, wrapped.anchor, wrapped.head, style)
    assert.equal(back.doc, '본문', `${style.name} 왕복 실패: ${doc} → ${back.doc}`)
  }
  ok('왕복: 굵게·기울임·밑줄 모두 감싸기 → 해제 = 원본')
}

console.log(`\n✅ 굵게·기울임·밑줄(inlineMark): ${pass}개 검증 통과`)
