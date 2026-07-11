/**
 * 에디터 E2E — 실제 Electron 앱을 띄워 "새 소설 → 챕터 열기 → 한글 입력 → 자동저장"을 검증.
 * 컴파일만으론 못 잡는 런타임 버그(window.prompt·에디터 미초기화)를 잡기 위한 실동작 테스트.
 *
 * 실행: npm run build 후  npm run test:e2e
 * 서재는 임시폴더로 강제(ICEFICTION_DOCS)해 실제 Documents를 건드리지 않는다.
 */
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TYPED = '폭우가 도시를 삼켰다'

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-e2e-'))
  const app = await electron.launch({
    // --user-data-dir로 localStorage(설정)까지 격리 — 실제 앱 취향을 건드리지 않고 매번 초기 상태에서 시작.
    args: ['.', `--user-data-dir=${join(home, 'userdata')}`],
    env: {
      ...process.env,
      ICEFICTION_DOCS: home,
      ICEFICTION_CONFIG: join(home, 'config.json')
    }
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.lib-new', { timeout: 15000 })
    console.log('  ✓ 책장(서재) 화면 로드')

    // 새 소설 → 입력 모달(window.prompt 대체) → 만들기
    await page.click('.lib-new')
    await page.waitForSelector('.dialog-input', { timeout: 5000 })
    await page.fill('.dialog-input', '테스트북')
    await page.click('.dialog-confirm')
    console.log('  ✓ 새 소설 모달 입력 → 생성')

    // 워크스페이스 진입 + 씨앗 챕터 열기
    await page.waitForSelector('.binder-file', { timeout: 8000 })
    await page.click('.binder-file')

    // 에디터가 편집 가능 상태(contenteditable=true)가 될 때까지 대기
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })
    console.log('  ✓ 챕터 열림 + 에디터 편집 가능')

    // 한글 입력 (전체 선택 후 교체)
    await page.click('.cm-content')
    await page.keyboard.press('Control+A')
    await page.keyboard.type(TYPED)
    const shown = (await page.textContent('.cm-content')) ?? ''
    assert(shown.includes(TYPED), `에디터에 입력 텍스트가 안 보임: "${shown}"`)
    console.log('  ✓ 한글 입력이 에디터에 반영됨')

    // 자동 저장(2초 디바운스) 후 디스크 파일에 반영됐는지 확인
    await page.waitForTimeout(3000)
    const mdDir = join(home, 'ICEFiction', '테스트북', 'manuscript')
    const files = (await fs.readdir(mdDir)).filter((f) => f.endsWith('.md'))
    assert(files.length >= 1, 'manuscript에 .md 없음')
    const raw = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(raw.includes(TYPED), `저장 파일에 입력 텍스트가 없음:\n${raw}`)
    console.log('  ✓ 자동 저장 — 디스크 파일에 입력 텍스트 기록')

    // 보기·테마 설정: 줄번호 토글 + 테마 변경이 실제로 반영되는지
    await page.click('.rightpanel-tabs button:has-text("보기")')
    await page.waitForSelector('.viewset', { timeout: 5000 })

    const gutterVar = () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--gutter-display').trim())
    await page.click('.vs-switch input[type="checkbox"]') // 줄번호 켜기
    assert.equal(await gutterVar(), 'flex', '줄번호 토글이 CSS 변수에 반영 안 됨')
    console.log('  ✓ 줄번호 토글 → 거터 표시 반영')

    await page.click('.vs-theme:has-text("다크")')
    const bg = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--paper-bg').trim().toLowerCase()
    )
    assert.equal(bg, '#1e1f22', `테마 변경(다크) 배경색 미반영: ${bg}`)
    console.log('  ✓ 테마 변경(다크) → 캔버스 배경색 반영')

    // 어두운 종이 → 마크다운 색이 밝은 쪽으로(data-paper-dark + --md-link 밝은 값)
    const paperDark = await page.evaluate(() =>
      document.documentElement.getAttribute('data-paper-dark')
    )
    assert.equal(paperDark, 'true', `다크 종이인데 data-paper-dark 미설정: ${paperDark}`)
    const mdLink = await page.evaluate(() => {
      const el = document.querySelector('.cm-editor')
      return getComputedStyle(el).getPropertyValue('--md-link').trim().toLowerCase()
    })
    assert.equal(mdLink, '#b3acff', `다크 종이 마크다운 링크색 미반영: ${mdLink}`)
    console.log('  ✓ 어두운 종이 → 마크다운 강조색 밝게(대비 확보)')

    // 앱 모드(라이트) — 도구창 전체가 밝아진다(data-app-mode + --bg 팔레트)
    await page.click('.vs-appmode button:has-text("라이트")')
    const appMode = await page.evaluate(() => document.documentElement.getAttribute('data-app-mode'))
    assert.equal(appMode, 'light', `앱 모드 미반영: ${appMode}`)
    const appBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    )
    assert.equal(appBg, '#f3f4f6', `라이트 앱 배경색(--bg) 미반영: ${appBg}`)
    // 강조 버튼(background: var(--accent))이 라이트 모드에서 회색으로 덮이지 않는지(specificity 회귀 방지)
    const primaryBg = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.vs-appmode button')].find((x) =>
        x.classList.contains('active')
      )
      return getComputedStyle(b).backgroundColor
    })
    assert.equal(
      primaryBg,
      'rgb(91, 82, 214)',
      `라이트 모드에서 강조 버튼이 흐려짐(흰 글자+밝은 배경 버그): ${primaryBg}`
    )
    await page.click('.vs-appmode button:has-text("다크")') // 원복
    console.log('  ✓ 앱 모드(라이트) → 전체 밝기 + 강조 버튼 유지')

    // ── 자료 갤러리 + 캐릭터 이미지 ──
    const bookDir = join(home, 'ICEFiction', '테스트북')
    // 실제 1x1 PNG를 assets/images에 심어 반입 상태를 만든다
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )
    await fs.mkdir(join(bookDir, 'assets', 'images'), { recursive: true })
    await fs.writeFile(join(bookDir, 'assets', 'images', 'face.png'), PNG)

    await page.click('.rightpanel-tabs button:has-text("자료")')
    await page.click('.assets-tools button[title="새로고침"]')
    await page.waitForSelector('.asset-tile', { timeout: 5000 })
    console.log('  ✓ 자료 갤러리에 반입 이미지 표시')

    await page.click('.asset-tile')
    await page.waitForSelector('.lb-media', { timeout: 4000 })
    await page.keyboard.press('Escape')
    console.log('  ✓ 라이트박스 확대 열림/닫힘')

    // PDF 열기 — 자료의 PDF 클릭 시 별도 뷰어 창(file://…​.pdf)이 열리는지
    await fs.mkdir(join(bookDir, 'assets', 'refs'), { recursive: true })
    await fs.writeFile(join(bookDir, 'assets', 'refs', 'ref.pdf'), Buffer.from('%PDF-1.4\n%%EOF\n'))
    await page.click('.assets-tools button[title="새로고침"]')
    await page.waitForSelector('.asset-tile[title="ref.pdf"]', { timeout: 5000 })
    const [pdfWin] = await Promise.all([
      app.waitForEvent('window'),
      page.click('.asset-tile[title="ref.pdf"]')
    ])
    const pdfUrl = pdfWin.url()
    assert(pdfUrl.toLowerCase().includes('.pdf'), `PDF 뷰어 창 URL 이상: ${pdfUrl}`)
    await pdfWin.close()
    console.log('  ✓ PDF 열기: 별도 뷰어 창(file://….pdf) 표시')

    // 캐릭터 생성 → 선택 → 이미지 첨부
    await page.click('.binder-add[title="캐릭터 추가"]')
    await page.waitForSelector('.dialog-input', { timeout: 5000 })
    await page.fill('.dialog-input', '김철수')
    await page.click('.dialog-confirm')
    await page.click('.binder-file:has-text("김철수")')
    await page.click('.rightpanel-tabs button:has-text("인스펙터")')
    await page.click('.insp-add-image')
    await page.waitForSelector('.picker-tile', { timeout: 5000 })
    await page.click('.picker-tile')
    await page.waitForSelector('.insp-thumb img', { timeout: 4000 })
    console.log('  ✓ 캐릭터에 이미지 첨부 → 인스펙터 썸네일 표시')

    await page.waitForTimeout(2800)
    const charMd = await fs.readFile(join(bookDir, 'characters', '김철수.md'), 'utf8')
    assert(
      charMd.includes('images:') && charMd.includes('face.png'),
      `캐릭터 프론트매터에 images 미저장:\n${charMd}`
    )
    console.log('  ✓ 캐릭터 이미지가 프론트매터(images)에 저장')

    // 마크다운 라이브 프리뷰 — 제목 기호 숨김 + 이미지 인라인 렌더/로드
    await page.click('.binder-file:has-text("첫 장")')
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })
    await page.click('.cm-content')
    await page.keyboard.press('Control+A')
    // 표준 마크다운(문서 기준 상대경로) — 첫 장은 manuscript/ 아래이므로 ../assets/…
    await page.keyboard.type('# 큰제목\n![](../assets/images/face.png)\n끝')

    // 이미지가 요소로 렌더될 뿐 아니라 ice-asset://로 실제 로드되는지(사용자 지적: 주소만 들어옴)
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.cm-inline-image')
        return !!img && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 6000 }
    )
    console.log('  ✓ 인라인 이미지 렌더 + 실제 로드(ice-asset)')

    // 커서가 다른 줄일 때 제목 기호(#)가 숨겨지는지(라이브 프리뷰)
    const headingText = await page.evaluate(() => {
      const line = [...document.querySelectorAll('.cm-line')].find((l) =>
        (l.textContent || '').includes('큰제목')
      )
      return line ? line.textContent : ''
    })
    assert(
      headingText.includes('큰제목') && !headingText.includes('#'),
      `제목 기호 숨김 실패: "${headingText}"`
    )
    console.log('  ✓ 라이브 프리뷰: 제목 기호(#) 숨김')

    // 인앱 자료 드래그(ice-asset URL) → 편집기에 ![[..]] 임베드로(사용자 지적: 주소로 들어감)
    await page.evaluate(() => {
      const el = document.querySelector('.cm-content')
      const r = el.getBoundingClientRect()
      const dtr = new DataTransfer()
      dtr.setData('text/plain', 'ice-asset://asset/assets/images/face.png')
      el.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: dtr,
          bubbles: true,
          cancelable: true,
          clientX: r.left + 15,
          clientY: r.top + 10
        })
      )
    })
    await page.waitForTimeout(2800)
    const raw2 = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(!raw2.includes('ice-asset://'), `드롭이 URL 주소로 삽입됨(버그 재현):\n${raw2}`)
    // 타이핑 1개 + 인앱 드래그 1개 = 표준 임베드 2개 이상(문서 기준 ../assets/…).
    assert(
      (raw2.match(/!\[\]\(\.\.\/assets\/images\/face\.png\)/g) || []).length >= 2,
      `인앱 드래그가 표준 임베드로 안 들어감:\n${raw2}`
    )
    console.log('  ✓ 인앱 자료 드래그 → 표준 ![](..) 임베드로 삽입(URL 아님)')

    // UI 줌 — API 반환값 + Ctrl+= 표시
    const z = await page.evaluate(() => window.api.zoomBy(0.3))
    assert(Math.abs(z - 1.3) < 0.001, `zoomBy 반환 이상: ${z}`)
    const z0 = await page.evaluate(() => window.api.zoomReset())
    assert(z0 === 1, `zoomReset 이상: ${z0}`)
    await page.keyboard.press('Control+Equal')
    await page.waitForSelector('.zoom-pill', { timeout: 2000 })
    await page.evaluate(() => window.api.zoomReset())
    console.log('  ✓ UI 줌(zoomBy/Reset + Ctrl+= 표시)')

    // 구분선(---) 라이브 렌더 — 커서가 다른 줄이면 실제 가로선(.cm-hr)으로 보인다(사용자 지적)
    await page.click('.cm-content')
    await page.keyboard.press('Control+A')
    await page.keyboard.type('첫 줄\n\n---\n\n끝 줄')
    await page.waitForSelector('.cm-hr', { timeout: 4000 })
    console.log('  ✓ 구분선(---) → 실제 가로선 렌더')

    // '자료 반입' 오버레이가 드롭 후 눌어붙지 않는지(사용자 버그 재현·회귀 방지)
    await page.evaluate(() => {
      const app = document.querySelector('.app')
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'drop-test.png', { type: 'image/png' }))
      app.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
      app.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
    })
    await page.waitForSelector('.drop-overlay', { timeout: 2000 }) // 파일 드래그 → 오버레이 표시
    await page.evaluate(() => {
      window.dispatchEvent(new DragEvent('drop', { dataTransfer: new DataTransfer(), bubbles: true }))
    })
    await page.waitForSelector('.drop-overlay', { state: 'detached', timeout: 2000 }) // 드롭 후 사라짐
    console.log('  ✓ 자료 반입 오버레이: 파일 드래그 시 표시 → 드롭 후 사라짐(눌어붙음 없음)')

    // 집중 모드 — 양쪽 패널 접기(원고만) → 다시 펼치기
    await page.click('.ws-focus')
    await page.waitForSelector('.binder', { state: 'detached', timeout: 3000 })
    await page.waitForSelector('.rightpanel', { state: 'detached', timeout: 3000 })
    console.log('  ✓ 집중 모드: 양쪽 패널 접힘(원고만)')
    await page.click('.ws-focus')
    await page.waitForSelector('.binder', { timeout: 3000 })
    await page.waitForSelector('.rightpanel', { timeout: 3000 })
    console.log('  ✓ 집중 모드 해제: 패널 복원')

    console.log(
      '\n✅ 에디터 E2E: 22개 검증 통과 (…+ PDF뷰어 + 집중모드 + 앱모드 + 구분선 + 드롭오버레이)'
    )
  } finally {
    await app.close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ E2E 실패:', err)
  process.exit(1)
})
