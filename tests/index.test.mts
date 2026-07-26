/**
 * 전체 목차 + 열람 프로토콜(BLUEPRINT §7.5) — 폴더 안의 모든 파일을 알리고, 요청받은 파일만 읽어 준다.
 * 실행: npx tsx tests/index.test.mts
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

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

async function main(): Promise<void> {
  const root = await fs.mkdtemp(join(tmpdir(), 'icefic-index-'))
  const svc = new ProjectService()
  await svc.create(root, '목차테스트')

  await fs.writeFile(
    join(root, 'notes', '취재메모.md'),
    '---\ntype: note\ntitle: 취재메모\nsynopsis: 1970년대 부산 시장 조사\n---\n\n국제시장은 새벽 네 시에 문을 연다.\n',
    'utf8'
  )
  await fs.writeFile(
    join(root, 'characters', '김이.md'),
    '---\ntype: character\ntitle: 김이\n---\n\n마흔둘. 부산 토박이.\n',
    'utf8'
  )
  await fs.writeFile(join(root, 'assets', 'images', '지도.png'), PNG_1x1)
  await fs.writeFile(join(root, 'assets', 'refs', '원고.hwp'), Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
  await fs.writeFile(join(root, 'assets', 'refs', '메모.txt'), '시장 상인 인터뷰 전문', 'utf8')

  // 1) 목차 — 원고에 이름이 안 나온 문서도, 앱이 못 읽는 한글 파일도 전부 알린다
  const ctx = await svc.buildAiContext('manuscript/01-첫-장.md', '아무 이름도 없는 본문')
  assert.ok(ctx.text.includes('## 프로젝트 전체 목차'), '목차 블록이 없다')
  assert.ok(ctx.text.includes('notes/취재메모.md'), '노트가 목차에 없다')
  assert.ok(ctx.text.includes('1970년대 부산 시장 조사'), '노트 줄거리가 목차에 없다')
  assert.ok(ctx.text.includes('characters/김이.md'), '캐릭터가 목차에 없다')
  assert.ok(ctx.text.includes('assets/images/지도.png'), '이미지 경로가 목차에 없다')
  assert.ok(ctx.text.includes('assets/refs/원고.hwp'), '한글 파일이 목차에 없다')
  assert.ok(ctx.text.includes('[[열람: 경로]]'), '열람 안내가 없다')
  ok('목차 — 노트·캐릭터·이미지·한글 파일까지 경로로 전부 알린다')

  // 2) 이미 실은 파일은 ✓로 표시해 중복 열람을 막는다
  assert.ok(ctx.text.includes('✓ assets/refs/메모.txt'), '자동으로 읽은 자료에 ✓가 없다')
  ok('자동으로 읽은 파일은 ✓ 표시')

  // 3) 열람 — .md는 제목·줄거리까지 붙여 돌려준다
  const opened = await svc.readForAi(['notes/취재메모.md'])
  assert.equal(opened.length, 1)
  assert.equal(opened[0].kind, 'text')
  assert.ok(opened[0].text!.includes('국제시장은 새벽 네 시에'), '본문 누락')
  assert.ok(opened[0].text!.includes('줄거리: 1970년대'), '프론트매터 요약 누락')
  ok('열람 — .md는 제목·줄거리와 함께 돌려준다')

  // 4) 이미지는 참조만(base64는 생성 직전에 채운다)
  const img = await svc.readForAi(['assets/images/지도.png'])
  assert.equal(img[0].kind, 'image')
  assert.equal(img[0].dataBase64, undefined, '열람 단계에서 base64를 실으면 안 된다')
  assert.equal(img[0].mediaType, 'image/png')
  ok('열람 — 이미지는 참조만 돌려준다')

  // 5) 못 읽는 형식·없는 파일은 조용히 빠지지 않고 사실대로 알린다
  const bad = await svc.readForAi(['assets/refs/원고.hwp', 'notes/없는파일.md'])
  assert.equal(bad.length, 2)
  assert.ok(bad[0].text!.includes('글자를 뽑지 못'), `hwp 안내 실패: ${bad[0].text}`)
  assert.ok(bad[1].text!.includes('그런 파일이 없습니다'), `없는 파일 안내 실패: ${bad[1].text}`)
  ok('못 읽는 형식·없는 파일을 사실대로 알린다')

  // 6) 경로 탈출 차단
  const escaped = await svc.readForAi(['../../secret.txt', '/etc/passwd'])
  for (const a of escaped) {
    assert.ok(
      a.text!.includes('열 수 없는 경로') || a.text!.includes('그런 파일이 없습니다'),
      `경로 탈출이 막히지 않았다: ${a.path} → ${a.text}`
    )
  }
  ok('프로젝트 밖 경로는 열리지 않는다')

  // 7) 한 번에 5개까지
  for (let i = 0; i < 8; i += 1) {
    await fs.writeFile(join(root, 'notes', `n${i}.md`), `메모 ${i}`, 'utf8')
  }
  const capped = await svc.readForAi(Array.from({ length: 8 }, (_, i) => `notes/n${i}.md`))
  assert.equal(capped.length, 5, `열람 상한 위반: ${capped.length}`)
  ok('열람은 한 번에 5개까지')

  await fs.rm(root, { recursive: true, force: true })
  console.log(`\n목차·열람 테스트 ${pass}개 통과`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
