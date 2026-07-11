/**
 * 개발기용 스크린샷 캡쳐 — 실제 Electron 앱을 띄워 데모 소설을 채우고 주요 화면을 찍는다.
 * env: SHOTS(출력 폴더), DEMO_ASSETS(데모 이미지 폴더)
 */
import { _electron as electron } from 'playwright-core'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SHOTS = process.env.SHOTS
const DEMO = process.env.DEMO_ASSETS

const AI_REPLY =
  '빗물이 계단을 타고 흘러내렸다. 지훈은 젖은 손등으로 눈가를 닦으며 설아를 마주 봤다. ' +
  '오래 참아온 말들이 목 끝까지 차올랐지만, 그는 아무 말도 하지 않았다. 그저 이 도시의 끝에서 ' +
  '다시 마주 선 두 사람 사이로, 차가운 비만이 조용히 내렸다.'

function fakeServer() {
  return new Promise((resolve) => {
    const s = createServer((req, res) => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'llama3.1' }, { id: 'qwen2.5' }] }))
        return
      }
      if (req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        const chunks = AI_REPLY.match(/.{1,12}/gu) || []
        for (const c of chunks)
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      res.writeHead(404).end()
    })
    s.listen(0, '127.0.0.1', () =>
      resolve({ base: `http://127.0.0.1:${s.address().port}/v1`, close: () => s.close() })
    )
  })
}

const fm = (o) =>
  '---\n' +
  Object.entries(o)
    .map(([k, v]) =>
      Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${x}`).join('\n')}` : `${k}: ${v}`
    )
    .join('\n') +
  '\n---\n\n'

async function writeBook(dir) {
  // 데모 자료 복사
  await fs.mkdir(join(dir, 'assets', 'images'), { recursive: true })
  for (const f of ['jihoon.png', 'seola.png', 'glacier.png'])
    await fs.copyFile(join(DEMO, f), join(dir, 'assets', 'images', f))

  // 씨앗 챕터 제거
  await fs.rm(join(dir, 'manuscript', '01-첫-장.md'), { force: true })

  // 원고
  await fs.writeFile(
    join(dir, 'manuscript', '01-폭우.md'),
    fm({ type: 'chapter', title: '폭우', status: 'revising', synopsis: '지훈이 북구에서 설아와 재회한다.', order: 1 }) +
      `# 폭우\n\n비가 쏟아지기 시작한 것은 지훈이 북구의 낡은 계단을 절반쯤 올랐을 때였다. 그는 걸음을 멈추고 잿빛 하늘을 올려다봤다.\n\n![[assets/images/glacier.png]]\n\n"**네가 여기까지 올 줄은 몰랐어.**" 뒤에서 익숙한 목소리가 들렸다. 설아였다.\n\n> 우리는 늘 이 도시의 끝에서 다시 만나곤 했다.\n\n그는 웃음을 터뜨렸다. 하지만 그 웃음은 마치 *오래 참아온 것*처럼 어렵게 새어 나왔다.\n\n\n`
  )
  await fs.writeFile(
    join(dir, 'manuscript', '02-관측소.md'),
    fm({ type: 'chapter', title: '관측소', status: 'draft', synopsis: '지훈이 무너진 관측소로 돌아간다.', order: 2 }) +
      '# 관측소\n\n관측소는 3년째 폐쇄된 채였다.\n'
  )

  // 캐릭터
  await fs.writeFile(
    join(dir, 'characters', '지훈.md'),
    fm({ type: 'character', title: '지훈', status: 'done', images: ['assets/images/jihoon.png'] }) +
      '전직 관측소 기술자. 빙하 도시 북구 출신.\n\n- **나이**: 29\n- **성격**: 과묵하지만 한번 마음을 열면 끝까지 간다.\n- **비밀**: 관측소 붕괴 사고의 유일한 생존자.\n'
  )
  await fs.writeFile(
    join(dir, 'characters', '설아.md'),
    fm({ type: 'character', title: '설아', status: 'revising', images: ['assets/images/seola.png'] }) +
      '지훈의 옛 동료. 도시를 떠났다가 돌아왔다.\n'
  )

  // 세계관 — 사용자 카테고리(폴더)
  await fs.mkdir(join(dir, 'world', '장소'), { recursive: true })
  await fs.writeFile(
    join(dir, 'world', '장소', '빙하-도시.md'),
    fm({ type: 'world', title: '빙하 도시' }) +
      '북극권에 세워진 마지막 도시. 3중 방벽으로 한파를 막는다.\n'
  )
}

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-cap-'))
  const { base, close } = await fakeServer()
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(home, 'ud')}`],
    env: { ...process.env, ICEFICTION_DOCS: home, ICEFICTION_CONFIG: join(home, 'cfg.json') }
  })
  const page = await app.firstWindow()
  const shot = async (name) => {
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(SHOTS, name) })
    console.log('  📸', name)
  }
  try {
    await page.waitForSelector('.lib-new', { timeout: 15000 })

    // 책 생성
    await page.click('.lib-new')
    await page.waitForSelector('.dialog-input')
    await page.fill('.dialog-input', '빙하의 아이')
    await page.click('.dialog-confirm')
    await page.waitForSelector('.binder-file', { timeout: 8000 })

    // 데모 내용 채우고 재스캔(서재 갔다가 다시 열기)
    await writeBook(join(home, 'ICEFiction', '빙하의 아이'))
    await page.click('.ws-back')
    await page.waitForSelector('.book-card', { timeout: 6000 })
    await shot('01-bookshelf.png') // 책장

    await page.click('.book-card')
    await page.waitForSelector('.binder-file:has-text("폭우")', { timeout: 8000 })

    // 에디터 — 마크다운 라이브프리뷰 + 인라인 이미지
    await page.click('.binder-file:has-text("폭우")')
    await page.waitForSelector('.cm-content[contenteditable="true"]')
    await page.locator('.cm-content').focus() // 클릭하면 인라인 이미지에 닿아 라이트박스가 열림 → focus만
    await page.keyboard.press('Control+End') // 커서를 끝으로 → 위쪽 기호 숨김/이미지 렌더
    await page.waitForFunction(
      () => {
        const i = document.querySelector('.cm-inline-image')
        return !!i && i.complete && i.naturalWidth > 0
      },
      undefined,
      { timeout: 6000 }
    )
    await shot('02-editor.png')

    // 인스펙터 — 캐릭터 + 이미지
    await page.click('.binder-file:has-text("지훈")')
    await page.waitForSelector('.insp-thumb img', { timeout: 5000 })
    await shot('03-inspector.png')

    // 자료 갤러리
    await page.click('.rightpanel-tabs button:has-text("자료")')
    await page.waitForSelector('.asset-tile', { timeout: 5000 })
    await shot('04-assets.png')

    // AI — 설정(가짜 서버) + 채팅
    await page.click('.rightpanel-tabs button:has-text("AI")')
    await page.waitForSelector('.ai-setup')
    await page.fill('.ai-setup input[placeholder="http://localhost:11434/v1"]', base)
    await page.click('.ai-save')
    await page.waitForSelector('.ai-dot-ok', { timeout: 8000 })
    // 원고(폭우)를 다시 열어 컨텍스트가 그 장면이 되도록
    await page.click('.binder-file:has-text("폭우")')
    await page.click('.rightpanel-tabs button:has-text("AI")')
    await page.waitForTimeout(800)
    await page.fill('.ai-input textarea', '이 장면의 분위기를 살려 다음 문단을 써줘.')
    await page.click('.ai-send')
    await page.waitForSelector('.ai-msg-assistant .ai-msg-body', { timeout: 8000 })
    await page.waitForTimeout(1200)
    await shot('05-ai.png')

    // 보기·테마 설정
    await page.click('.rightpanel-tabs button:has-text("보기")')
    await page.waitForSelector('.viewset')
    await shot('06-view-settings.png')

    // 다크 테마 + 에디터
    await page.click('.vs-theme:has-text("다크")')
    await page.click('.rightpanel-tabs button:has-text("인스펙터")')
    await page.click('.binder-file:has-text("폭우")')
    await page.locator('.cm-content').focus()
    await page.keyboard.press('Control+End')
    await page.waitForTimeout(700)
    await shot('07-dark.png')

    console.log('\n✅ 캡쳐 완료')
  } finally {
    await app.close()
    close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error('캡쳐 실패:', e)
  process.exit(1)
})
