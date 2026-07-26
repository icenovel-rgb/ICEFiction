/**
 * 삽화 비율(§7.6) — 비율표·요청 크기 매핑·중앙 크롭 계산.
 * 실행: npx tsx tests/aspect.test.mts
 */
import assert from 'node:assert/strict'
import {
  ASPECT_KEYS,
  ASPECTS,
  aspectOf,
  buildInstruction,
  cropRect,
  type AspectRatio
} from '../src/shared/imagePrompt'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

// 1) 7종이 모두 있고, target이 실제로 그 비율이다
assert.equal(ASPECT_KEYS.length, 7)
for (const key of ASPECT_KEYS) {
  const [w, h] = key.split(':').map(Number)
  const { target } = ASPECTS[key]
  const want = w / h
  const have = target.w / target.h
  assert.ok(
    Math.abs(have - want) / want < 0.01,
    `${key}: target ${target.w}x${target.h}이 비율과 어긋남 (${have.toFixed(3)} vs ${want.toFixed(3)})`
  )
}
ok('비율 7종 — target 크기가 실제 비율과 일치')

// 2) request는 엔진이 확실히 만드는 세 크기 중 하나
const NATIVE = ['1024x1024', '1536x1024', '1024x1536']
for (const key of ASPECT_KEYS) {
  const { request } = ASPECTS[key]
  assert.ok(
    NATIVE.includes(`${request.w}x${request.h}`),
    `${key}: 요청 크기 ${request.w}x${request.h}는 엔진이 못 만든다`
  )
}
ok('요청 크기는 엔진 지원 크기(1:1 · 3:2 · 2:3) 중 하나')

// 3) 크롭 — 이미 맞으면 자르지 않는다(오차 2% 허용)
assert.equal(cropRect({ w: 1024, h: 1024 }, '1:1'), null)
assert.equal(cropRect({ w: 1536, h: 864 }, '16:9'), null)
assert.equal(cropRect({ w: 1536, h: 866 }, '16:9'), null, '2% 이내는 그대로 둔다')
ok('비율이 이미 맞으면 자르지 않는다')

// 4) 가로가 남으면 좌우를, 세로가 남으면 위아래를 중앙 기준으로 자른다
const wide = cropRect({ w: 1536, h: 1024 }, '16:9')!
assert.deepEqual(wide, { x: 0, y: 80, width: 1536, height: 864 }, '16:9는 위아래를 잘라야 한다')
const tall = cropRect({ w: 1024, h: 1536 }, '9:16')!
assert.deepEqual(tall, { x: 80, y: 0, width: 864, height: 1536 }, '9:16은 좌우를 잘라야 한다')
const four = cropRect({ w: 1536, h: 1024 }, '4:3')!
assert.equal(four.height, 1024)
assert.equal(four.width, 1365)
assert.equal(four.x, Math.round((1536 - 1365) / 2))
ok('중앙 기준 크롭 — 남는 쪽만 균등하게 잘라낸다')

// 5) 잘린 결과가 목표 비율이 된다
for (const key of ASPECT_KEYS) {
  const { request } = ASPECTS[key]
  const rect = cropRect({ w: request.w, h: request.h }, key)
  const final = rect ? { w: rect.width, h: rect.height } : { w: request.w, h: request.h }
  const [w, h] = key.split(':').map(Number)
  assert.ok(
    Math.abs(final.w / final.h - w / h) / (w / h) < 0.02,
    `${key}: 크롭 후에도 비율이 안 맞음 (${final.w}x${final.h})`
  )
}
ok('요청 크기 → 크롭 → 목표 비율 도달(7종 전부)')

// 6) 지시문에 비율과 대체 크기가 함께 들어간다
const ins = buildInstruction({ destAbsPath: '/tmp/a.png', ratio: '16:9', prompt: '비 내리는 항구' })
assert.ok(ins.includes('Aspect ratio: 16:9'), '비율 문구 없음')
assert.ok(ins.includes('1536x864'), '목표 크기 없음')
assert.ok(ins.includes('1536x1024'), '대체(엔진 지원) 크기 없음')
ok('지시문 — 비율 + 목표 크기 + 대체 크기')

// 7) 알 수 없는 값은 1:1로 떨어진다(옛 설정 대비)
assert.equal(aspectOf(undefined), '1:1')
assert.equal(aspectOf('1024x1536' as unknown as AspectRatio), '1:1')
assert.equal(aspectOf('9:16'), '9:16')
ok('알 수 없는 비율 값은 안전하게 1:1')

console.log(`\n비율·크롭 테스트 ${pass}개 통과`)
