/**
 * AI 폴더·문체·슬래시 E2E — 실제 Electron에서 새 AI 배선을 끝까지 검증한다.
 *  ① 문체 하네스(§7.2a): style/문체지침.md가 전송 프롬프트 **맨 앞**에 실리는가
 *  ② 열람 프로토콜(§7.5): AI가 `[[열람: 경로]]`를 내면 앱이 파일을 읽어 자동으로 다시 물어보는가
 *  ③ 슬래시 명령(§6.1b) + 고스트 텍스트(§6.1a): `/이어쓰기` → 흐린 글씨 → Tab 채택 / Esc 취소
 *  ④ 안내(§6.1a): 메뉴·꼬리표·막대가 "Tab 확정 · Esc 취소"를 실제로 글자로 보여 주는가
 *    (그리고 그 안내 글자는 원고에 단 한 글자도 섞이지 않는가)
 *
 * 실행: npm run build 후  node tests/aifolder.e2e.mjs
 */
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const GUIDE = '한 문장은 40자를 넘기지 않는다.'
const NOTE_BODY = '국제시장은 새벽 네 시에 문을 연다.'
const OPEN_REQUEST = '[[열람: notes/취재메모.md]]'
const AFTER_OPEN = '메모를 확인했습니다. 새벽 네 시입니다.'
const CONTINUE = '밤은 조용했다.'
/** 슬래시 명령에 그 자리에서 덧붙이는 한 줄 지시(§6.1b) — 프롬프트엔 실리고 원고엔 남지 않아야 한다. */
const ORDER = '비가 그치고 형사가 돌아온다'

/** 요청 본문을 모두 기록하고, 내용에 따라 다른 답을 흘리는 가짜 OpenAI 서버. */
function fakeServer(bodies) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'test' }] }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
          bodies.push(raw)
          const reply = raw.includes('열람 결과')
            ? AFTER_OPEN
            : raw.includes('이어서') // 슬래시 /이어쓰기
              ? CONTINUE
              : OPEN_REQUEST
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          for (const piece of reply.match(/.{1,6}/gs) ?? [reply]) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
          }
          res.write('data: [DONE]\n\n')
          res.end()
        })
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

/** 고스트(제안)는 위젯이라 .cm-content 안에 그려진다 — **원고 글자만** 뽑으려면 걷어내야 한다. */
function docText(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.cm-content')?.cloneNode(true)
    if (!el) return ''
    el.querySelectorAll('.cm-ghost').forEach((g) => g.remove())
    return el.textContent ?? ''
  })
}

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-folder-'))
  const bodies = []
  const { base, close } = await fakeServer(bodies)
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
    await page.fill('.dialog-input', '폴더테스트')
    await page.click('.dialog-confirm')
    await page.waitForSelector('.binder-file', { timeout: 8000 })

    const bookDir = join(home, 'ICEFiction', '폴더테스트')

    // 문체 방이 자동으로 생겼는가(§7.2a) — 바인더에 '문체' 섹션 + 지침 파일
    await fs.access(join(bookDir, 'style', 'samples'))
    await fs.access(join(bookDir, 'style', '문체지침.md'))
    const sections = await page.$$eval('.binder-section-label', (els) =>
      els.map((e) => e.textContent ?? '')
    )
    assert(
      sections.some((s) => s.includes('문체')),
      `바인더에 문체 방이 없음: ${sections.join(', ')}`
    )
    console.log('  ✓ 문체 방 자동 생성 + 바인더 노출')

    // 실제 지침·참고 자료를 심는다(씨앗은 AI에 전달되지 않으므로 진짜 규칙으로 덮어쓴다)
    await fs.writeFile(
      join(bookDir, 'style', '문체지침.md'),
      `---\ntype: style\ntitle: 문체지침\n---\n\n## 문장\n${GUIDE}\n예) 이 줄은 예시라 전달되지 않는다\n`,
      'utf8'
    )
    await fs.writeFile(
      join(bookDir, 'notes', '취재메모.md'),
      `---\ntype: note\ntitle: 취재메모\nsynopsis: 부산 시장 취재\n---\n\n${NOTE_BODY}\n`,
      'utf8'
    )

    await page.click('.binder-file')
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })

    // AI 설정 — 가짜 서버
    await page.click('.rightpanel-tabs button:has-text("AI")')
    // 자동 연결(§7.3)이 성공하면 설정 폼은 접혀 있다 — ⚙로 직접 편다(연결 상태와 무관하게 열린다).
    await page.click('.ai-head-tools button[title="설정"]')
    await page.waitForSelector('.ai-setup', { timeout: 5000 })
    await page.fill('.ai-setup input[placeholder="http://localhost:11434/v1"]', base)
    await page.click('.ai-save')
    await page.waitForSelector('.ai-dot-ok', { timeout: 8000 })
    await page.waitForSelector('.ai-input textarea:not([disabled])', { timeout: 4000 })

    // 본문을 조금 써서 맥락을 갱신시킨다(디바운스 600ms)
    await page.click('.cm-content')
    await page.keyboard.type('밤이 깊었다.')
    await page.waitForSelector('.ai-chip.ctx-style', { timeout: 5000 })
    console.log('  ✓ 문체 칩 — AI가 문체 방을 보고 있음')

    // ① 문체 하네스가 프롬프트 **맨 앞**에 실리는가
    await page.fill('.ai-input textarea', '한 문장 써줘')
    await page.click('.ai-send')
    await page.waitForFunction(
      (want) =>
        [...document.querySelectorAll('.ai-msg-assistant .ai-msg-body')].some((e) =>
          (e.textContent || '').includes(want)
        ),
      '새벽 네 시',
      { timeout: 15000 }
    )
    const first = bodies[0] ?? ''
    const styleAt = first.indexOf('문체 지침 — 최우선')
    const flowAt = first.indexOf('전체 흐름')
    assert(styleAt >= 0, '전송 프롬프트에 문체 지침이 없음')
    assert(first.includes(GUIDE), '문체 규칙 본문이 전송되지 않음')
    assert(!first.includes('이 줄은 예시라'), '"예)" 줄이 전송됨')
    assert(flowAt > styleAt, `문체 지침이 맨 앞이 아님 (style=${styleAt}, flow=${flowAt})`)
    assert(first.includes('프로젝트 전체 목차'), '전체 목차가 전송되지 않음')
    assert(first.includes('notes/취재메모.md'), '목차에 노트가 없음')
    console.log('  ✓ 문체 지침이 프롬프트 맨 앞 + 전체 목차 동봉')

    // ② 열람 프로토콜 — 앱이 스스로 파일을 읽어 다시 물어봤는가
    assert(bodies.length >= 2, `자동 재요청이 없었다(요청 ${bodies.length}건)`)
    const second = bodies[1] ?? ''
    assert(second.includes('열람 결과'), '열람 결과 메시지가 없음')
    assert(second.includes(NOTE_BODY), '읽은 파일 내용이 전송되지 않음')
    const shown = await page.textContent('.ai-messages')
    assert(shown.includes('📖 열람'), '무엇을 읽었는지 화면에 표시되지 않음')
    assert(shown.includes(AFTER_OPEN), '열람 후 최종 답변이 표시되지 않음')
    assert(!shown.includes('[[열람'), '기계 문법이 화면에 그대로 노출됨')
    console.log('  ✓ 열람 프로토콜 — 파일 자동 읽기 → 재요청 → 최종 답변')

    // ③ 슬래시 명령 — `/` 메뉴 → 고스트 → Tab 채택
    await page.click('.cm-content')
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await page.waitForSelector('.cm-tooltip-autocomplete', { timeout: 5000 })
    console.log('  ✓ 본문에서 / → 슬래시 메뉴 표시')

    // ④-1 메뉴가 고르기 전에 결과와 조작 키를 알려 주는가
    const menuText = await page.textContent('.cm-tooltip-autocomplete')
    assert(menuText.includes('Tab 확정'), `메뉴에 결과 꼬리표가 없음:\n${menuText}`)
    const chrome = await page.evaluate(() => {
      const el = document.querySelector('.cm-tooltip-autocomplete')
      return {
        cls: el?.className ?? '',
        head: getComputedStyle(el, '::before').content,
        foot: getComputedStyle(el, '::after').content
      }
    })
    assert(chrome.cls.includes('ice-slash'), '슬래시 메뉴 전용 클래스가 안 붙음')
    assert(chrome.head.includes('AI 명령'), `메뉴 머리말 없음: ${chrome.head}`)
    assert(chrome.foot.includes('Esc') && chrome.foot.includes('Tab'), `메뉴 조작 안내 없음: ${chrome.foot}`)
    console.log('  ✓ 메뉴가 결과(Tab 확정)와 조작 키(Enter/Tab·Esc)를 미리 알려 준다')

    await page.click('.cm-tooltip-autocomplete li:has-text("이어쓰기")')

    // ④-0 한 줄 지시 입력(§6.1b) — 명령을 고르면 먼저 "어떻게 이어쓸까요?"를 묻는다.
    //     **비우고 Enter면 지시 없이 그대로 실행된다**(입력은 선택이지 의무가 아니다).
    await page.waitForSelector('.slash-ask-input', { timeout: 5000 })
    const askBar = await page.textContent('.slash-ask')
    assert(askBar.includes('/이어쓰기'), `지시 막대가 어떤 명령인지 안 알림: ${askBar}`)
    assert(askBar.includes('Enter') && askBar.includes('Esc'), `지시 막대 조작 안내 없음: ${askBar}`)
    const placeholder = await page.getAttribute('.slash-ask-input', 'placeholder')
    assert(placeholder && placeholder.length > 0, '지시 입력칸에 예시 안내가 없음')
    await page.keyboard.press('Enter') // 비운 채 실행
    await page.waitForSelector('.slash-ask-input', { state: 'detached', timeout: 4000 })
    console.log('  ✓ 슬래시 지시 입력 — 명령을 고르면 묻고, 비우면 그냥 실행')

    await page.waitForSelector('.cm-ghost', { timeout: 15000 })
    await page.waitForFunction(
      (want) => (document.querySelector('.cm-ghost')?.textContent ?? '').includes(want),
      CONTINUE,
      { timeout: 10000 }
    )
    const bareAsk = bodies[bodies.length - 1] ?? ''
    assert(!bareAsk.includes('작가 지시'), '지시를 안 넣었는데 지시 블록이 전송됨')
    const bodyBefore = await docText(page)
    assert(!bodyBefore.includes(CONTINUE), '제안이 원고에 이미 들어가 버림(고스트여야 한다)')
    console.log('  ✓ 고스트 텍스트 — 제안이 원고에 들어가지 않고 흐리게만 보임')

    // ④-2 제안이 다 오면 꼬리표와 안내 막대가 Tab/Esc를 말해 주는가
    await page.waitForSelector('.ghost-bar .ghost-btn.accept', { timeout: 10000 })
    const tag = await page.textContent('.cm-ghost-tag')
    assert(tag.includes('Tab 확정') && tag.includes('Esc 취소'), `고스트 꼬리표 문구가 없음: ${tag}`)
    const bar = await page.textContent('.ghost-bar')
    assert(bar.includes('Tab') && bar.includes('Esc'), `안내 막대 문구가 없음: ${bar}`)
    assert(bar.includes('/이어쓰기'), `안내 막대가 어떤 명령인지 안 알림: ${bar}`)
    console.log('  ✓ 흐린 글씨 옆 꼬리표 + 아래 안내 막대가 Tab 확정·Esc 취소를 알려 준다')

    await page.keyboard.press('Tab')
    await page.waitForSelector('.cm-ghost', { state: 'detached', timeout: 4000 })
    const bodyAfter = await docText(page)
    assert(bodyAfter.includes(CONTINUE), `Tab 채택 실패:\n${bodyAfter}`)
    assert(!bodyAfter.includes('/이어쓰기'), '명령 글자가 원고에 남음')
    assert(!bodyAfter.includes('Tab 확정'), '안내 꼬리표 글자가 원고에 섞임')
    assert((await page.locator('.ghost-bar').count()) === 0, '확정 후에도 안내 막대가 남음')
    console.log('  ✓ Tab → 제안이 원고에 확정(안내 글자는 원고에 안 남음)')

    // ④-3 지시를 실제로 넣으면 그 말이 프롬프트 끝에 실린다(§6.1b)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await page.waitForSelector('.cm-tooltip-autocomplete', { timeout: 5000 })
    await page.click('.cm-tooltip-autocomplete li:has-text("이어쓰기")')
    await page.waitForSelector('.slash-ask-input', { timeout: 5000 })
    await page.keyboard.type(ORDER)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.cm-ghost', { timeout: 15000 })
    await page.waitForFunction(
      (want) => (document.querySelector('.cm-ghost')?.textContent ?? '').includes(want),
      CONTINUE,
      { timeout: 10000 }
    )
    const told = bodies[bodies.length - 1] ?? ''
    assert(told.includes(ORDER), `작가 지시가 프롬프트에 없음:\n${told.slice(-400)}`)
    assert(told.includes('작가 지시'), '지시 블록 표지가 없음')
    const orderAt = told.lastIndexOf(ORDER)
    const beforeAt = told.lastIndexOf('[커서 직전]')
    assert(orderAt > beforeAt, `지시가 요청문 끝이 아님 (order=${orderAt}, before=${beforeAt})`)
    const afterOrder = await docText(page)
    assert(!afterOrder.includes(ORDER), '지시 글자가 원고에 새어 들어감')
    console.log('  ✓ 슬래시 지시 — 넣은 말이 요청문 끝에 실리고 원고엔 남지 않는다')

    // Esc — 제안 버리기
    await page.keyboard.press('Escape')
    await page.waitForSelector('.cm-ghost', { state: 'detached', timeout: 4000 })
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await page.waitForSelector('.cm-tooltip-autocomplete', { timeout: 5000 })
    await page.click('.cm-tooltip-autocomplete li:has-text("이어쓰기")')
    await page.waitForSelector('.slash-ask-input', { timeout: 5000 })
    await page.keyboard.press('Enter')
    await page.waitForSelector('.cm-ghost', { timeout: 15000 })
    await page.keyboard.press('Escape')
    await page.waitForSelector('.cm-ghost', { state: 'detached', timeout: 4000 })
    const afterEsc = await docText(page)
    assert(
      afterEsc.split(CONTINUE).length - 1 === 1,
      `Esc했는데 제안이 들어갔다:\n${afterEsc.slice(-200)}`
    )
    assert((await page.locator('.ghost-bar').count()) === 0, 'Esc 후에도 안내 막대가 남음')
    console.log('  ✓ Esc → 제안 버리기(원고 그대로, 안내 막대도 사라짐)')

    console.log('\n✅ AI 폴더·문체·슬래시 E2E: 10개 검증 통과')
  } finally {
    await app.close()
    close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ AI 폴더 E2E 실패:', err)
  process.exit(1)
})
