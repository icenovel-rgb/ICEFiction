/**
 * 문체 방(style/) 하네스 — 폴더 보강·지침 전달·샘플 발췌·토글(BLUEPRINT §7.2a).
 * 실행: npx tsx tests/style.test.mts  (electron 불필요)
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectService } from '../src/main/services/project'
import { buildStyleAnalysisPrompt, clipSamples, STYLE_SECTIONS } from '../src/shared/stylePrompt'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(join(tmpdir(), 'icefic-style-'))
  const svc = new ProjectService()
  await svc.create(root, '문체테스트')

  // 1) 문체 방이 씨앗과 함께 생긴다
  await fs.access(join(root, 'style', 'samples'))
  const seed = await fs.readFile(join(root, 'style', '문체지침.md'), 'utf8')
  assert.match(seed, /type: style/)
  assert.match(seed, /예\)/) // 씨앗에는 예시가 들어 있다
  ok('create — style/ + samples/ + 문체지침.md 씨앗')

  // 2) 씨앗 그대로면 하네스에 실리지 않는다(주석·"예)" 줄은 AI에게 보내지 않는다)
  const seededCtx = await svc.buildAiContext(null, '')
  assert.ok(!seededCtx.text.includes('문체 지침 — 최우선'), '씨앗만 있을 때는 문체 블록이 없어야 한다')
  assert.ok(!seededCtx.text.includes('여기에 적은'), '주석 안내문이 새어 나가면 안 된다')
  assert.ok(!seededCtx.chips.some((c) => c.kind === 'style'))
  ok('씨앗(예시·주석)만 있으면 문체 블록을 만들지 않는다')

  // 3) 사용자가 실제 규칙을 적으면 맥락 **맨 앞**에 실린다
  await fs.writeFile(
    join(root, 'style', '문체지침.md'),
    '---\ntype: style\ntitle: 문체지침\n---\n\n## 문장\n한 문장은 40자를 넘기지 않는다.\n예) 이 줄은 예시라 전달되지 않는다\n',
    'utf8'
  )
  await fs.writeFile(
    join(root, 'manuscript', '01-첫-장.md'),
    '---\ntype: chapter\ntitle: 첫 장\norder: 1\nsynopsis: 남자가 창을 닫는다\n---\n\n밤이 깊었다.\n',
    'utf8'
  )
  const ctx = await svc.buildAiContext('manuscript/01-첫-장.md', '밤이 깊었다.')
  const styleAt = ctx.text.indexOf('## 문체 지침 — 최우선')
  const flowAt = ctx.text.indexOf('## 전체 흐름')
  assert.ok(styleAt >= 0, '문체 블록이 있어야 한다')
  assert.ok(flowAt > styleAt, `문체 블록이 흐름보다 앞(style=${styleAt}, flow=${flowAt})`)
  assert.ok(ctx.text.includes('한 문장은 40자를 넘기지 않는다'))
  assert.ok(!ctx.text.includes('이 줄은 예시라'), '"예)" 줄은 전달되지 않아야 한다')
  assert.ok(ctx.chips.some((c) => c.kind === 'style' && c.label.includes('문체 지침')))
  ok('지침을 쓰면 맥락 맨 앞에 실리고, 예시 줄은 걸러진다')

  // 4) 샘플은 발췌로 실리고, 상한을 지킨다
  await fs.writeFile(join(root, 'style', 'samples', '옛작품.md'), '가'.repeat(5000), 'utf8')
  const withSample = await svc.buildAiContext(null, '')
  assert.ok(withSample.text.includes('### 문체 참고'))
  const excerptLen = (withSample.text.split('#### 옛작품\n')[1]?.match(/^가+/)?.[0] ?? '').length
  assert.equal(excerptLen, 1200, `샘플 한 편은 1200자까지 (실제 ${excerptLen})`)
  assert.ok(withSample.chips.some((c) => c.kind === 'style' && c.label.includes('참고')))
  ok('샘플은 편당 1,200자 발췌로 실린다')

  // 5) 토글을 끄면 통째로 빠진다
  const off = await svc.buildAiContext(null, '', true, false)
  assert.ok(!off.text.includes('문체 지침'))
  assert.ok(!off.chips.some((c) => c.kind === 'style'))
  ok('includeStyle=false면 문체 블록이 빠진다')

  // 6) 옛 책(문체 방 없는 폴더)을 열면 보강된다
  const old = await fs.mkdtemp(join(tmpdir(), 'icefic-old-'))
  const svc2 = new ProjectService()
  await svc2.create(old, '옛책')
  await fs.rm(join(old, 'style'), { recursive: true, force: true })
  await svc2.open(old)
  await fs.access(join(old, 'style', '문체지침.md'))
  ok('open — 문체 방이 없던 책도 열면 생긴다')

  // 7) 분석 프롬프트 — 항목·상한·지시 형식
  const prompt = buildStyleAnalysisPrompt([{ name: 'a.md', text: '나'.repeat(9000) }])
  for (const s of STYLE_SECTIONS) assert.ok(prompt.includes(s), `항목 누락: ${s}`)
  assert.ok(prompt.includes('코드펜스 없이'), '그대로 파일이 되므로 펜스 금지를 명시해야 한다')
  const clipped = clipSamples([{ name: 'a.md', text: '나'.repeat(9000) }])
  assert.equal(clipped[0].text.length, 4000, '샘플 한 편은 4,000자까지')
  const many = clipSamples(
    Array.from({ length: 10 }, (_, i) => ({ name: `${i}.md`, text: '다'.repeat(4000) }))
  )
  assert.equal(
    many.reduce((n, s) => n + s.text.length, 0),
    12000,
    '전체 상한 12,000자'
  )
  ok('문체 분석 프롬프트 — 항목·상한·출력 형식')

  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(old, { recursive: true, force: true })
  console.log(`\n문체 방 테스트 ${pass}개 통과`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
