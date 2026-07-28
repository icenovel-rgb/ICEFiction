/**
 * AI E2E — 실제 Electron에서 AI 패널 전체 스택 검증(IPC 스트리밍 + 패널 배선).
 * 로컬 가짜 OpenAI 서버로 응답을 흘리고, 설정→연결확인→전송→스트림 응답→본문 삽입까지 확인.
 * 실행: npm run build 후  npm run test:ai:e2e
 */
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPLY = '비가 쏟아지기 시작했다.'

function fakeServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'test' }] }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const piece of ['비가 ', '쏟아지기 ', '시작했다.']) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      res.writeHead(404).end()
    })
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      resolve({ base: `http://127.0.0.1:${port}/v1`, close: () => server.close() })
    })
  })
}

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-ai-'))
  const { base, close } = await fakeServer()
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(home, 'userdata')}`],
    env: { ...process.env, ICEFICTION_DOCS: home, ICEFICTION_CONFIG: join(home, 'config.json') }
  })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (e) => console.log('   [pageerror]', e.message))
    await page.waitForSelector('.lib-new', { timeout: 15000 })
    await page.click('.lib-new')
    await page.waitForSelector('.dialog-input')
    await page.fill('.dialog-input', 'AI테스트북')
    await page.click('.dialog-confirm')
    await page.waitForSelector('.binder-file', { timeout: 8000 })
    await page.click('.binder-file')
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })
    console.log('  ✓ 책·챕터 준비')

    // AI 탭 → 프로바이더 설정(가짜 서버) → 저장+연결확인
    await page.click('.rightpanel-tabs button:has-text("AI")')
    // 자동 연결(§7.3)이 성공하면 설정 폼은 접혀 있다 — ⚙로 직접 편다(연결 상태와 무관하게 열린다).
    await page.click('.ai-head-tools button[title="설정"]')
    await page.waitForSelector('.ai-setup', { timeout: 5000 })
    // Base URL만 가짜 서버로 바꾼다. 모델은 무엇이든 가짜 서버가 응답한다(드롭다운/입력 무관).
    await page.fill('.ai-setup input[placeholder="http://localhost:11434/v1"]', base)
    await page.click('.ai-save')
    // 연결되면 헤더에 초록 점(.ai-dot-ok)이 뜨고 입력창이 활성화된다(설정 패널은 접힘).
    await page.waitForSelector('.ai-dot-ok', { timeout: 8000 })
    await page.waitForSelector('.ai-input textarea:not([disabled])', { timeout: 4000 })
    console.log('  ✓ 프로바이더 설정 + 연결 확인(ok)')

    // 컨텍스트 빌더: 현재 장면을 자동으로 보고 있는지(칩) 확인
    await page.waitForSelector('.ai-chip.ctx-scene', { timeout: 4000 })
    console.log('  ✓ 컨텍스트 칩: 현재 장면 자동 포함(항상 원고를 봄)')

    // 메시지 전송 → 스트림 응답
    await page.fill('.ai-input textarea', '한 문장 써줘')
    await page.click('.ai-send')
    await page.waitForFunction(
      (want) => {
        const els = [...document.querySelectorAll('.ai-msg-assistant .ai-msg-body')]
        return els.some((e) => (e.textContent || '').includes(want))
      },
      '시작했다',
      { timeout: 8000 }
    )
    console.log('  ✓ AI 스트림 응답 패널에 표시')

    // "보낸 내용 보기" — AI가 실제 받은 내용(맥락+메시지)을 그대로 보여주는지(투명성 §7.2)
    await page.click('.ai-head-tools button[title="AI에게 보낸(보낼) 내용 보기"]')
    await page.waitForSelector('.promptview', { timeout: 4000 })
    const sent = (await page.textContent('.promptview-body')) ?? ''
    assert(sent.includes('한 문장 써줘'), `보낸 내용에 사용자 메시지 없음:\n${sent.slice(0, 200)}`)
    assert(sent.includes('시스템 지시'), '시스템 지시 역할 라벨 없음')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.promptview', { state: 'detached', timeout: 3000 })
    console.log('  ✓ 보낸 내용 보기: 실제 전송 프롬프트 표시')

    // 본문에 넣기 → 에디터에 삽입 → 자동저장 확인
    await page.click('.ai-insert')
    await page.waitForTimeout(2800)
    const mdDir = join(home, 'ICEFiction', 'AI테스트북', 'manuscript')
    const files = (await fs.readdir(mdDir)).filter((f) => f.endsWith('.md'))
    const raw = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(raw.includes(REPLY), `본문 삽입/저장 실패:\n${raw}`)
    console.log('  ✓ 본문에 넣기 → 원고에 삽입 + 자동저장')

    // ── 자료 첨부(§7.5) — 이미지를 AI에 첨부하면 전송 프롬프트에 포함되는지 ──
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )
    await fs.mkdir(join(home, 'ICEFiction', 'AI테스트북', 'assets', 'images'), { recursive: true })
    await fs.writeFile(join(home, 'ICEFiction', 'AI테스트북', 'assets', 'images', 'ref.png'), PNG)

    await page.click('.ai-attach-add')
    await page.waitForSelector('.picker-tile', { timeout: 5000 })
    await page.click('.picker-tile')
    await page.waitForSelector('.ai-attach', { timeout: 4000 })
    console.log('  ✓ 자료 첨부: 픽커에서 이미지 선택 → 첨부 칩 표시')

    await page.fill('.ai-input textarea', '이 그림 봐줘')
    await page.click('.ai-send')
    await page.waitForFunction(
      () => [...document.querySelectorAll('.ai-msg-assistant .ai-msg-body')].length >= 2,
      undefined,
      { timeout: 8000 }
    )
    await page.click('.ai-head-tools button[title="AI에게 보낸(보낼) 내용 보기"]')
    await page.waitForSelector('.promptview-att', { timeout: 4000 })
    const attText = (await page.textContent('.promptview-atts')) ?? ''
    assert(attText.includes('ref.png'), `보낸 내용에 첨부 미포함:\n${attText}`)
    await page.keyboard.press('Escape')
    console.log('  ✓ 자료 첨부: 이미지가 전송 프롬프트에 포함(보낸 내용에서 확인)')

    console.log(
      '\n✅ AI E2E: 8개 검증 통과 (설정·연결·컨텍스트칩·스트림·보낸내용·본문삽입·첨부칩·첨부전송)'
    )
  } finally {
    await app.close()
    close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ AI E2E 실패:', err)
  process.exit(1)
})
