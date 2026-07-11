/**
 * mdEmbed 순수 함수 검증 — 표준 임베드 삽입 경로 계산 + 위키링크/표준 렌더 정규화(§6.10).
 * electron/node-path 비의존. 실행: npm run test:md
 */
import assert from 'node:assert/strict'
import {
  decodeEmbedUrl,
  embedToRootRel,
  encodeEmbedUrl,
  posixDir,
  relPosix,
  resolvePosix,
  toStandardEmbed
} from '../src/shared/mdEmbed'

let pass = 0
const ok = (l: string): void => {
  pass += 1
  console.log(`  ✓ ${l}`)
}

// 1) posixDir
assert.equal(posixDir('manuscript/01-장.md'), 'manuscript')
assert.equal(posixDir('assets/images/x.png'), 'assets/images')
assert.equal(posixDir('root.md'), '')
ok('posixDir: 문서 디렉터리 추출')

// 2) relPosix — 문서 디렉터리 → 자료
assert.equal(relPosix('manuscript', 'assets/images/x.png'), '../assets/images/x.png')
assert.equal(relPosix('manuscript/1부', 'assets/images/x.png'), '../../assets/images/x.png')
assert.equal(relPosix('', 'assets/x.png'), 'assets/x.png') // 루트 문서
assert.equal(relPosix('characters', 'characters/face.png'), 'face.png') // 같은 폴더
ok('relPosix: 문서 기준 상대경로 계산(하위폴더·루트·동일폴더)')

// 3) resolvePosix — 되돌리기(렌더용)
assert.equal(resolvePosix('manuscript', '../assets/images/x.png'), 'assets/images/x.png')
assert.equal(resolvePosix('manuscript/1부', '../../assets/x.png'), 'assets/x.png')
assert.equal(resolvePosix('characters', 'face.png'), 'characters/face.png')
ok('resolvePosix: 문서 기준 → 루트 기준 복원')

// 왕복 항등: 루트경로 → 문서기준 → 루트경로
for (const [doc, asset] of [
  ['manuscript/01-장.md', 'assets/images/비 오는 날.png'],
  ['manuscript/1부/03.md', 'assets/refs/a(b).pdf'],
  ['characters/철수.md', 'characters/face.png']
] as const) {
  const rel = relPosix(posixDir(doc), asset)
  assert.equal(resolvePosix(posixDir(doc), rel), asset, `왕복 실패: ${doc} / ${asset}`)
}
ok('왕복 항등: 루트→문서기준→루트 (공백·괄호·한글 포함)')

// 4) 인코딩 — 공백·괄호·# 만 %-인코딩, 슬래시·한글 보존
assert.equal(encodeEmbedUrl('assets/images/비 오는 날.png'), 'assets/images/비%20오는%20날.png')
assert.equal(encodeEmbedUrl('assets/a(b)#c.png'), 'assets/a%28b%29%23c.png')
assert.equal(decodeEmbedUrl('assets/images/비%20오는%20날.png'), 'assets/images/비 오는 날.png')
ok('encode/decode: 깨지는 문자만 인코딩, 슬래시·한글 보존')

// 5) toStandardEmbed — 삽입 문자열(문서 기준 + 인코딩)
assert.equal(
  toStandardEmbed('assets/images/face.png', 'manuscript/01-장.md'),
  '![](../assets/images/face.png)'
)
assert.equal(
  toStandardEmbed('assets/images/비 온다.png', 'manuscript/01-장.md'),
  '![](../assets/images/비%20온다.png)'
)
// docPath 없으면 루트경로 그대로(폴백)
assert.equal(toStandardEmbed('assets/images/face.png', null), '![](assets/images/face.png)')
ok('toStandardEmbed: 문서 기준 표준 마크다운 생성')

// 6) embedToRootRel — 렌더 시 루트 기준으로 정규화
// 표준(문서 기준) 임베드
assert.equal(
  embedToRootRel('../assets/images/face.png', false, 'manuscript/01-장.md'),
  'assets/images/face.png'
)
// %20 디코드 후 해석
assert.equal(
  embedToRootRel('../assets/images/비%20온다.png', false, 'manuscript/01-장.md'),
  'assets/images/비 온다.png'
)
// 레거시 위키링크(루트 기준) — docPath 무관하게 그대로
assert.equal(
  embedToRootRel('assets/images/face.png', true, 'manuscript/01-장.md'),
  'assets/images/face.png'
)
ok('embedToRootRel: 표준(문서기준)·레거시(위키링크) 둘 다 루트 기준으로 정규화')

console.log(`\n✅ mdEmbed: ${pass}개 검증 통과`)
