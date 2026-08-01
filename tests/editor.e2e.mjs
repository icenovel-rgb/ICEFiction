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

/**
 * 수정 키 — 앱은 CodeMirror의 `Mod-` 로 바인딩하고, Mod 는 **mac에서 Cmd, 그 외에서 Ctrl** 이다.
 * 여기서 'Control' 로 고정하면 mac에서는 전체 선택이 아니라 "줄 처음으로 이동"(CM6 mac 키맵의
 * Ctrl-a)이 실행돼, 원고를 지우지 않은 채 덧입력되면서 뒤 단계가 줄줄이 어긋난다.
 */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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

    // 기본 글꼴 = 내장 나눔고딕(새 프로필). PC에 폰트가 없어도 같은 판면이 나오게.
    const paperFont = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--paper-font')
    )
    assert(
      paperFont.includes('NanumGothic'),
      `기본 글꼴이 나눔고딕이 아님: ${paperFont}`
    )
    const gothicLoaded = await page.evaluate(async () => (await document.fonts.load('16px "NanumGothic"')).length)
    assert(gothicLoaded > 0, '내장 나눔고딕이 로드되지 않음')
    console.log('  ✓ 기본 글꼴: 내장 나눔고딕(실제 로드 확인)')

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
    await page.keyboard.press(`${MOD}+A`)
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
    await page.keyboard.press(`${MOD}+A`)
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
    await page.keyboard.press(`${MOD}+Equal`)
    await page.waitForSelector('.zoom-pill', { timeout: 2000 })
    await page.evaluate(() => window.api.zoomReset())
    console.log('  ✓ UI 줌(zoomBy/Reset + Ctrl+= 표시)')

    // 구분선(---) 라이브 렌더 — 커서가 다른 줄이면 실제 가로선(.cm-hr)으로 보인다(사용자 지적)
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('첫 줄\n\n---\n\n끝 줄')
    await page.waitForSelector('.cm-hr', { timeout: 4000 })
    console.log('  ✓ 구분선(---) → 실제 가로선 렌더')

    // 마크다운 인용문(>) → 인용 블록(.cm-blockquote) + 커서 없는 줄의 '>' 숨김(사용자 지적: 인용문 미작동)
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('> 인용된 문장\n\n일반 문장') // 커서는 마지막 '일반 문장' 줄(인용 줄에서 벗어남)
    await page.waitForSelector('.cm-blockquote', { timeout: 4000 })
    const quoteText = await page.evaluate(() => {
      const el = document.querySelector('.cm-blockquote')
      return el ? el.textContent : ''
    })
    assert(
      quoteText.includes('인용된 문장') && !quoteText.includes('>'),
      `인용문 렌더 실패(블록/기호 숨김): "${quoteText}"`
    )
    console.log('  ✓ 마크다운 인용문 → 인용 블록 + > 기호 숨김')

    // 문단 정렬(보기 설정) — 기본 양쪽(justify), 버튼으로 변경 시 CSS 변수(--paper-align) 반영
    await page.click('.rightpanel-tabs button:has-text("보기")')
    await page.waitForSelector('.vs-align-doc', { timeout: 4000 })
    const alignVar = () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--paper-align').trim())
    assert.equal(await alignVar(), 'justify', `기본 문단 정렬이 양쪽(justify)이 아님: ${await alignVar()}`)
    await page.click('.vs-align-doc button:has-text("왼쪽")')
    assert.equal(await alignVar(), 'left', '문단 정렬(왼쪽) 변경이 CSS 변수에 반영 안 됨')
    await page.click('.vs-align-doc button:has-text("양쪽")') // 원복
    console.log('  ✓ 문단 정렬(문서 기본값): 양쪽 기본 + 전환 반영')

    // ── 인용문 탈출 — 빈 인용 줄에서 Enter 한 번이면 인용을 빠져나온다 ──
    // (lang-markdown 기본은 인용을 계속 이어붙여 Enter 3번을 눌러야 나온다 → 모르면 이후 본문이
    //  전부 인용문에 갇힌다. 실측 버그. 화면은 '>'를 숨기므로 **저장된 원본**으로 검증해야 한다.)
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('> 인용문입니다')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('다시 본문')
    await page.waitForTimeout(2800)
    const rawQuote = await fs.readFile(join(mdDir, files[0]), 'utf8')
    const bodyQuote = rawQuote.split('---').slice(2).join('---')
    assert(
      bodyQuote.includes('> 인용문입니다'),
      `인용문이 사라짐:\n${JSON.stringify(bodyQuote)}`
    )
    assert(
      !/>\s*다시 본문/.test(bodyQuote),
      `Enter 2번으로 인용문을 못 빠져나옴 — 본문이 인용에 갇힘:\n${JSON.stringify(bodyQuote)}`
    )
    assert(
      /다시 본문/.test(bodyQuote) && /\n\s*\n\s*다시 본문/.test(bodyQuote),
      `인용문과 본문 사이 빈 줄이 없음(마크다운 lazy continuation으로 다시 인용에 빨려듦):\n${JSON.stringify(bodyQuote)}`
    )
    console.log('  ✓ 인용문 탈출: 빈 인용 줄에서 Enter → 본문으로 복귀(빈 줄 확보)')

    // ── 탭키 들여쓰기 — 전각 공백(U+3000). 마크다운 코드블록 오인을 피하는 한글 원고 관례 ──
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('들여쓸 문장')
    await page.keyboard.press('Home')
    await page.keyboard.press('Tab')
    const indented = await page.evaluate(() => {
      const line = [...document.querySelectorAll('.cm-line')].find((l) =>
        (l.textContent || '').includes('들여쓸 문장')
      )
      return line ? line.textContent : ''
    })
    assert.equal(indented.charCodeAt(0), 0x3000, `Tab이 전각 공백을 넣지 않음: ${JSON.stringify(indented)}`)
    await page.waitForTimeout(2800)
    const rawTab = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(rawTab.includes('　들여쓸 문장'), `전각 공백 들여쓰기가 파일에 저장 안 됨:\n${JSON.stringify(rawTab)}`)
    assert(!/^\t|^ {4}/m.test(rawTab.split('---').pop()), '탭문자·4칸 공백이 들어가 코드블록이 될 위험')
    // Shift+Tab 으로 되돌리기
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+Tab')
    const outdented = await page.evaluate(() => {
      const line = [...document.querySelectorAll('.cm-line')].find((l) =>
        (l.textContent || '').includes('들여쓸 문장')
      )
      return line ? line.textContent : ''
    })
    assert.notEqual(outdented.charCodeAt(0), 0x3000, 'Shift+Tab이 들여쓰기를 제거 못함')
    console.log('  ✓ 탭 들여쓰기: 전각 공백 삽입/제거 + 파일 반영(코드블록 안 됨)')

    // ── 선택한 부분만 정렬 — 드래그 선택 → <div align="center">로 파일에 기록, 태그는 화면에서 숨김 ──
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    // 가운데 갈 문단은 **두 줄**로 — 한 줄짜리로 테스트하면 "첫 줄만 정렬 누락" 버그를 놓친다(실측).
    await page.keyboard.type('첫 문단\n\n가운데 갈 문단\n둘째 줄도 가운데\n\n끝 문단')
    // 문단 일부만 드래그 선택 → 문단 전체가 정렬돼야 한다
    await page.locator('.cm-line', { hasText: '둘째 줄도 가운데' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.click('.vs-align-sel button:has-text("가운데")')

    await page.waitForTimeout(2800)
    const rawAlign = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(
      rawAlign.includes('<div align="center">') && rawAlign.includes('</div>'),
      `선택 문단 정렬이 <div align>으로 기록 안 됨:\n${rawAlign}`
    )
    // 감싸는 과정에서 본문이 유실되지 않았는지(모든 문단이 살아 있어야 한다)
    for (const p of ['첫 문단', '가운데 갈 문단', '둘째 줄도 가운데', '끝 문단']) {
      assert(rawAlign.includes(p), `정렬 적용 중 본문 유실: "${p}" 없음\n${rawAlign}`)
    }
    assert(!/<div align="center">\s*\n\s*\n\s*<\/div>/.test(rawAlign), '빈 정렬 블록이 생김')

    // 선택한 문단의 **모든 줄**에 정렬이 붙었는지 + 다른 문단은 안 붙었는지
    const centered = await page.evaluate(() => ({
      centeredLines: [...document.querySelectorAll('.cm-line.cm-align-center')].map((l) => l.textContent),
      otherClasses: [...document.querySelectorAll('.cm-line')]
        .filter((l) => (l.textContent || '').includes('첫 문단'))
        .map((l) => l.className)
        .join(' ')
    }))
    assert.deepEqual(
      centered.centeredLines,
      ['가운데 갈 문단', '둘째 줄도 가운데'],
      `문단의 모든 줄이 가운데 정렬되지 않음(첫 줄 누락 회귀): ${JSON.stringify(centered.centeredLines)}`
    )
    assert(
      !centered.otherClasses.includes('cm-align'),
      `선택하지 않은 문단까지 정렬됨: ${centered.otherClasses}`
    )
    console.log('  ✓ 선택 문단만 정렬: <div align="center"> 기록 + 그 문단의 모든 줄이 가운데')

    // 커서를 블록 밖으로 → <div> 태그 줄이 화면에서 사라진다(라이브 프리뷰)
    await page.locator('.cm-line', { hasText: '끝 문단' }).click()
    await page.waitForTimeout(300)
    const visibleText = (await page.textContent('.cm-content')) ?? ''
    assert(
      !visibleText.includes('<div') && !visibleText.includes('</div>'),
      `정렬 태그가 화면에 노출됨: ${visibleText}`
    )
    console.log('  ✓ 정렬 태그(<div align>)는 화면에서 숨김 — 원고엔 남아 이식성 유지')

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

    // ── 섹션 갤러리 — '캐릭터'를 누르면 인물이 카드로 죽 펼쳐지고, 카드를 누르면 그 문서가 열린다 ──
    await page.click('.binder-section-label:has-text("캐릭터")')
    await page.waitForSelector('.gallery', { timeout: 5000 })
    const charCard = page.locator('.gal-card', { hasText: '김철수' })
    await charCard.waitFor({ timeout: 5000 })
    // 앞서 붙인 얼굴 이미지(face.png)가 카드 표지로 실제 로드되는지
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.gal-card .gal-cover-img')
        return !!img && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 6000 }
    )
    console.log('  ✓ 섹션 갤러리: 캐릭터 카드 + 첨부 이미지가 표지로 렌더')

    await charCard.click()
    await page.waitForSelector('.gallery', { state: 'detached', timeout: 4000 })
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 5000 })
    const sbPath = (await page.textContent('.sb-path')) ?? ''
    assert(sbPath.includes('김철수'), `갤러리 카드 클릭이 그 문서를 열지 않음: ${sbPath}`)
    console.log('  ✓ 섹션 갤러리: 카드 클릭 → 해당 문서가 에디터로 열림')

    // ── 따옴표 자동 짝(§6.1c) — 대사를 가장 많이 두드리므로 손이 먼저 가는 기능 ──
    // 여는 따옴표 하나에 짝이 생기고, 닫을 때 한 번 더 치면 **짝을 건너뛴다**(""가 두 벌 생기면 안 된다).
    await page.click('.binder-file:has-text("첫 장")')
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })
    await page.click('.cm-content')
    // 문서를 **지워서** 비운다 — 선택 상태에서 따옴표를 치면 '감싸기'가 되므로(바로 아래에서 검증)
    // 여기서 Ctrl+A 후 바로 치면 원고 전체가 따옴표에 감싸인다.
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('"')
    const paired = await page.evaluate(() => {
      const l = document.querySelector('.cm-line')
      return l ? l.textContent : ''
    })
    assert.equal(paired, '""', `따옴표 자동 짝이 안 생김: ${JSON.stringify(paired)}`)
    await page.keyboard.type('어서 와.')
    await page.keyboard.type('"') // 손으로 닫기 → 건너뛰기(한 벌만 남아야 한다)
    const closed = await page.evaluate(() => {
      const l = document.querySelector('.cm-line')
      return l ? l.textContent : ''
    })
    assert.equal(closed, '"어서 와."', `닫는 따옴표 건너뛰기 실패(짝이 두 벌?): ${JSON.stringify(closed)}`)
    console.log('  ✓ 따옴표 자동 짝: " → "" + 손으로 닫으면 건너뛰기')

    // 고른 글을 따옴표로 감싸기 — 서술 한 줄을 대사로 바꾸는 손놀림
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('어서 와')
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.type('"')
    const wrapped = await page.evaluate(() => {
      const l = document.querySelector('.cm-line')
      return l ? l.textContent : ''
    })
    assert.equal(wrapped, '"어서 와"', `선택 감싸기 실패: ${JSON.stringify(wrapped)}`)
    console.log('  ✓ 따옴표 자동 짝: 고른 글을 통째로 감싸기')

    // 빈 짝 사이 Backspace → 두 부호가 함께 사라진다
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type("'")
    await page.keyboard.press('Backspace')
    // 문서가 비면 그 자리에 안내(placeholder)가 그려지므로 '빈 문자열'이 아니라 **부호가 없음**을 본다.
    const afterBs = await page.evaluate(() => {
      const l = document.querySelector('.cm-line')
      return l ? l.textContent : ''
    })
    assert(
      !afterBs.includes("'"),
      `빈 짝 Backspace가 한 짝만 지움(따옴표가 남음): ${JSON.stringify(afterBs)}`
    )
    console.log('  ✓ 따옴표 자동 짝: 빈 짝("") 사이 Backspace → 둘 다 삭제')

    // ── Enter로 따옴표 **밖으로**(§6.1c) — 닫는 부호를 또 치지 않아도 다음 줄로 ──
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('"') // → ""(커서 안쪽)
    await page.keyboard.type('어서 와.')
    await page.keyboard.press('Enter') // 닫는 " 밖으로 나가 새 줄
    await page.keyboard.type('그가 말했다.')
    const exited = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cm-line')).map((l) => l.textContent)
    )
    assert.deepEqual(
      exited,
      ['"어서 와."', '그가 말했다.'],
      `Enter가 따옴표 밖으로 못 나감: ${JSON.stringify(exited)}`
    )
    console.log('  ✓ 따옴표 탈출: 대사 안에서 Enter → 닫는 부호 건너뛰고 다음 줄')

    // 뒤에 글이 남아 있으면 평소 Enter다 — 줄 가르기를 빼앗지 않는다
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.press('Delete')
    await page.keyboard.type('"어서 와." 그가 말했다.')
    await page.keyboard.press('Home')
    // `"어서 와." 그가…` 에서 닫는 " **바로 앞**(6번째 글자 뒤)으로 — 뒤에 ' 그가…'가 남는 자리
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    const split = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cm-line')).map((l) => l.textContent)
    )
    assert.deepEqual(
      split,
      ['"어서 와.', '" 그가 말했다.'],
      `닫는 부호 뒤에 글이 있는데도 탈출함(줄 가르기를 빼앗음): ${JSON.stringify(split)}`
    )
    console.log('  ✓ 따옴표 탈출: 닫는 부호 뒤에 글이 남으면 평소 Enter(줄 가르기)')

    // ── 줄 앞 `--` → 불릿(•) · `-` 세 번 → 구분선(---) (§6.1c) ──
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('--항목 하나')
    const bulletLine = await page.evaluate(() => {
      const l = document.querySelector('.cm-line')
      return l ? l.textContent : ''
    })
    assert.equal(bulletLine, '• 항목 하나', `줄 앞 -- 가 불릿이 안 됨: ${JSON.stringify(bulletLine)}`)
    console.log('  ✓ 불릿: 줄 앞 `--` → `• ` (파일에도 • 로 기록)')

    /**
     * ★회귀(사용자 신고): 문단 아래에서 줄표를 두 번 치면 **위 문단이 커졌다**.
     * 원인은 마크다운 Setext 제목 — 문단 바로 아래 `--`/`---` 줄이 위 문단을 제목으로 만든다.
     * 이제 Setext 파서를 껐으므로 위 문단은 본문 크기 그대로고, `---`은 가로 구분선이 된다.
     */
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('비가 내렸다')
    await page.keyboard.press('Enter')
    await page.keyboard.type('---') // 두 번째 -에서 불릿, 세 번째 -에서 구분선으로 되돌아온다
    await page.keyboard.press('Enter')
    await page.keyboard.type('그는 우산을 접었다')
    const sizes = await page.evaluate(() => {
      const line = [...document.querySelectorAll('.cm-line')].find((l) =>
        (l.textContent || '').includes('비가 내렸다')
      )
      const el = line?.querySelector('span') ?? line
      return {
        measured: parseFloat(getComputedStyle(el).fontSize),
        base: parseFloat(getComputedStyle(document.querySelector('.cm-content')).fontSize)
      }
    })
    assert(
      Math.abs(sizes.measured - sizes.base) < 0.6,
      `줄표 두 번에 위 문단이 제목으로 커짐(Setext 회귀): ${sizes.measured}px vs 본문 ${sizes.base}px`
    )
    await page.waitForSelector('.cm-hr', { timeout: 4000 }) // 세 번 → 진짜 구분선
    console.log('  ✓ 회귀: 줄표 아래 문단이 제목으로 커지지 않음 + `-` 세 번 → 구분선')

    // ── Shift+Enter — 문단 간격 없는 줄바꿈(줄간격만) ──
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('첫 줄')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('둘째 줄')
    await page.keyboard.press('Enter')
    await page.keyboard.type('새 문단')
    await page.waitForTimeout(2800)
    const rawSoft = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(
      rawSoft.includes('첫 줄  \n둘째 줄'),
      `Shift+Enter가 마크다운 하드 브레이크(줄 끝 공백 2칸)로 저장되지 않음:\n${JSON.stringify(rawSoft)}`
    )
    const gaps = await page.evaluate(() => {
      const find = (t) =>
        [...document.querySelectorAll('.cm-line')].find((l) => (l.textContent || '').includes(t))
      const soft = find('첫 줄')
      const normal = find('둘째 줄')
      return {
        softClass: soft?.className ?? '',
        softPad: parseFloat(getComputedStyle(soft).paddingBottom),
        normalPad: parseFloat(getComputedStyle(normal).paddingBottom)
      }
    })
    assert(gaps.softClass.includes('cm-soft-break'), `Shift+Enter 줄 표시 없음: ${gaps.softClass}`)
    assert.equal(gaps.softPad, 0, `Shift+Enter 줄에 문단 간격이 붙음: ${gaps.softPad}px`)
    assert(gaps.normalPad > 0, `보통 문단의 간격이 사라짐(회귀): ${gaps.normalPad}px`)
    console.log('  ✓ Shift+Enter: 줄 끝 공백 2칸으로 저장 + 그 줄만 문단 간격 0')

    // ── 보기 옵션: 대사가 이어질 땐 붙이기 ──
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    // 따옴표는 자동 짝이 붙으므로 닫는 따옴표까지 그대로 쳐도 한 벌만 남는다(위에서 검증).
    await page.keyboard.type('그는 문을 열었다.\n"어서 와."\n"오래 기다렸어?"\n그는 웃었다.')
    await page.click('.rightpanel-tabs button:has-text("보기")')
    const tightSwitch = page.locator('.vs-switch:has-text("대사가 이어질 땐 붙이기") input')
    await tightSwitch.click()
    const tightVar = () =>
      page.evaluate(() => document.documentElement.style.getPropertyValue('--paper-tight-gap').trim())
    assert.equal(await tightVar(), '0px', `연속 대사 옵션이 CSS 변수에 반영 안 됨: ${await tightVar()}`)
    const dlg = await page.evaluate(() => {
      const find = (t) =>
        [...document.querySelectorAll('.cm-line')].find((l) => (l.textContent || '').includes(t))
      const first = find('어서 와')
      const last = find('오래 기다렸어')
      const narration = find('그는 문을 열었다')
      return {
        firstPad: parseFloat(getComputedStyle(first).paddingBottom),
        lastPad: parseFloat(getComputedStyle(last).paddingBottom),
        narrationPad: parseFloat(getComputedStyle(narration).paddingBottom),
        lastClass: last?.className ?? ''
      }
    })
    assert.equal(dlg.firstPad, 0, `이어지는 대사 사이 간격이 남음: ${dlg.firstPad}px`)
    assert(dlg.narrationPad > 0, `서술→대사 경계 간격이 사라짐: ${dlg.narrationPad}px`)
    assert(
      !dlg.lastClass.includes('cm-tight-dialogue') && dlg.lastPad > 0,
      `마지막 대사→서술 경계 간격이 사라짐: ${dlg.lastPad}px / ${dlg.lastClass}`
    )
    console.log('  ✓ 연속 대사: 대사끼리 간격 0 · 서술과 맞닿는 앞뒤 경계는 유지')

    await tightSwitch.click() // 원복 — 끄면 그 줄도 보통 간격으로 돌아온다
    assert.notEqual(await tightVar(), '0px', '연속 대사 옵션을 꺼도 0으로 남음')
    const restored = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.cm-line')].find((x) =>
        (x.textContent || '').includes('어서 와')
      )
      return parseFloat(getComputedStyle(l).paddingBottom)
    })
    assert(restored > 0, `옵션을 꺼도 간격이 0으로 남음: ${restored}px`)
    console.log('  ✓ 연속 대사: 옵션을 끄면 즉시 원복(데코 재조립 없이 CSS 변수로)')

    // ── Ctrl+B / Ctrl+I / Ctrl+U — 굵게·기울임·밑줄(밑줄은 마크다운에 없어 <u>) ──
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('굵게 갈 말\n밑줄 갈 말\n다른 줄')
    await page.locator('.cm-line', { hasText: '굵게 갈 말' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press(`${MOD}+B`)
    await page.locator('.cm-line', { hasText: '밑줄 갈 말' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press(`${MOD}+U`)
    await page.locator('.cm-line', { hasText: '다른 줄' }).click() // 커서를 옮겨 기호 숨김 확인
    await page.waitForTimeout(2800)
    const rawMark = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(rawMark.includes('**굵게 갈 말**'), `Ctrl+B가 **로 기록되지 않음:\n${rawMark}`)
    assert(rawMark.includes('<u>밑줄 갈 말</u>'), `Ctrl+U가 <u>로 기록되지 않음:\n${rawMark}`)
    await page.waitForSelector('.cm-u', { timeout: 4000 })
    const underline = await page.evaluate(() => {
      const el = document.querySelector('.cm-u')
      return { text: el.textContent, deco: getComputedStyle(el).textDecorationLine }
    })
    assert.equal(underline.text, '밑줄 갈 말', `밑줄 범위가 어긋남: ${underline.text}`)
    assert(underline.deco.includes('underline'), `밑줄이 그려지지 않음: ${underline.deco}`)
    const visibleU = (await page.textContent('.cm-content')) ?? ''
    assert(!visibleU.includes('<u>'), `밑줄 태그가 화면에 노출됨: ${visibleU}`)
    console.log('  ✓ 굵게/밑줄: **굵게** · <u>밑줄</u> 기록 + 태그 숨기고 밑줄로 렌더')

    /**
     * 밑줄 **안쪽을 고칠 수 있어야** 한다. mark 데코까지 atomicRanges에 넣으면 커서가 그 범위를
     * 통째로 건너뛰어 글자가 태그 밖에 떨어진다(실측 함정) → 실제로 한 글자를 넣어 확인한다.
     */
    await page.locator('.cm-u').click()
    await page.keyboard.type('X')
    await page.waitForTimeout(2800)
    const rawInside = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(
      /<u>[^<\n]*X[^<\n]*<\/u>/.test(rawInside),
      `밑줄 안쪽에 글자를 넣을 수 없음(아톰 회귀) — X가 태그 밖으로 떨어짐:\n${rawInside}`
    )
    console.log('  ✓ 밑줄 안쪽 편집 가능(mark 데코는 아톰이 아니어야 한다)')

    /**
     * ── ★서식 × 줄바꿈 원칙(사용자 신고) ──
     * ① Shift+Enter 줄을 통째로 골라 굵게 걸면 줄 끝 공백 두 칸(하드 브레이크)이 마커 안으로
     *    빨려 들어가 줄바꿈 표시가 죽었다 → 마커는 글자에만 붙어야 한다.
     * ② 대사에 서식을 걸면 줄 첫 글자가 `*`가 되어 '연속 대사 붙이기'가 그 줄만 못 알아봤다.
     */
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('시 한 줄')
    await page.keyboard.press('Shift+Enter') // 하드 브레이크(줄 끝 공백 2칸)
    await page.keyboard.type('다음 줄')
    await page.locator('.cm-line', { hasText: '시 한 줄' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End') // 줄 전체 = 공백 두 칸까지 선택
    await page.keyboard.press(`${MOD}+B`)
    await page.waitForTimeout(2800)
    const rawSoftBold = await fs.readFile(join(mdDir, files[0]), 'utf8')
    assert(
      rawSoftBold.includes('**시 한 줄**  \n'),
      `굵게가 하드 브레이크(줄 끝 공백 2칸)를 삼킴:\n${JSON.stringify(rawSoftBold)}`
    )
    const softStillTight = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.cm-line')].find((x) =>
        (x.textContent || '').includes('시 한 줄')
      )
      return { cls: l?.className ?? '', pad: parseFloat(getComputedStyle(l).paddingBottom) }
    })
    assert(
      softStillTight.cls.includes('cm-soft-break') && softStillTight.pad === 0,
      `굵게를 걸자 Shift+Enter 줄에 문단 간격이 붙음: ${JSON.stringify(softStillTight)}`
    )
    console.log('  ✓ 서식×줄바꿈: 굵게를 걸어도 Shift+Enter 줄바꿈이 살아 있다')

    // 서식이 걸린 대사도 다음 대사와 붙는다
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('그는 문을 열었다.\n"어서 와."\n"오래 기다렸어?"\n우산에서 물이 떨어졌다.')
    await page.locator('.cm-line', { hasText: '어서 와' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press(`${MOD}+B`) // 대사 한 줄만 굵게
    await page.locator('.cm-line', { hasText: '우산에서' }).click()
    await page.click('.rightpanel-tabs button:has-text("보기")')
    await tightSwitch.click() // 연속 대사 붙이기 켜기
    const boldDialogue = await page.evaluate(() => {
      const l = [...document.querySelectorAll('.cm-line')].find((x) =>
        (x.textContent || '').includes('어서 와')
      )
      return { cls: l?.className ?? '', pad: parseFloat(getComputedStyle(l).paddingBottom) }
    })
    assert(
      boldDialogue.cls.includes('cm-tight-dialogue') && boldDialogue.pad === 0,
      `굵게 걸린 대사를 대사로 못 알아봄(간격이 남음): ${JSON.stringify(boldDialogue)}`
    )
    await tightSwitch.click() // 원복
    console.log('  ✓ 서식×줄바꿈: 굵게 걸린 대사도 다음 대사와 붙는다')

    // ── 도움말 창(F1 · 상단바 ?) — 마크다운 + 이 앱 문법을 한 화면에 ──
    await page.keyboard.press('F1')
    await page.waitForSelector('.help-sheet', { timeout: 4000 })
    const helpText = (await page.textContent('.help-sheet')) ?? ''
    for (const must of ['Shift+Enter', '전각', '불릿', '밑줄']) {
      assert(helpText.includes(must), `도움말에 "${must}" 설명이 없음`)
    }
    await page.keyboard.press('Escape')
    await page.waitForSelector('.help-sheet', { state: 'detached', timeout: 3000 })
    await page.click('.ws-help')
    await page.waitForSelector('.help-sheet', { timeout: 3000 })
    await page.click('.help-x')
    await page.waitForSelector('.help-sheet', { state: 'detached', timeout: 3000 })
    console.log('  ✓ 도움말: F1·상단바 ? 로 열림, Esc·✕ 로 닫힘 + 이 앱 문법 포함')

    /**
     * ── 원고 자리 고정(§8) — 한쪽 패널만 열어도 쓰던 줄이 밀리지 않는가 ──
     *
     * 요점은 눈에 보이는 위치다. 그래서 CSS 클래스가 아니라 **종이의 실제 중심**을 네 가지 상태
     * (둘 다 / 왼쪽만 / 오른쪽만 / 둘 다 닫힘)에서 재서 값이 같은지 본다.
     *
     * 동시에 **가려지지 않는지도** 본다 — 패널을 원고 위에 띄우는 방식은 글자를 덮어 못 쓴다
     * (되돌린 접근). 종이의 오른쪽 끝이 오른쪽 패널의 왼쪽 끝을 넘지 않아야 한다.
     */
    const paperBox = () =>
      page.evaluate(() => {
        const r = document.querySelector('.cm-content').getBoundingClientRect()
        const rp = document.querySelector('.rightpanel')?.getBoundingClientRect()
        const bd = document.querySelector('.binder')?.getBoundingClientRect()
        return {
          center: Math.round(r.left + r.width / 2),
          left: Math.round(r.left),
          right: Math.round(r.right),
          rpLeft: rp ? Math.round(rp.left) : null,
          bdRight: bd ? Math.round(bd.right) : null
        }
      })
    const both = await paperBox()
    assert(
      both.right <= both.rpLeft && both.left >= both.bdRight,
      `원고가 패널에 가려짐(띄우기 방식 회귀): ${JSON.stringify(both)}`
    )
    console.log('  ✓ 원고 고정: 패널이 글자를 가리지 않는다(겹치지 않음)')

    await page.click('.ws-tools button[title^="오른쪽 패널"]') // 오른쪽만 접기 → 왼쪽 패널만 열린 상태
    await page.waitForSelector('.rightpanel', { state: 'detached', timeout: 3000 })
    const leftOnly = await paperBox()
    assert(
      Math.abs(leftOnly.center - both.center) <= 2,
      `오른쪽 패널을 접자 원고가 밀림: ${both.center} → ${leftOnly.center}`
    )
    await page.click('.ws-tools button[title^="바인더"]') // 왼쪽도 접기 → 둘 다 닫힘
    await page.waitForSelector('.binder', { state: 'detached', timeout: 3000 })
    const none = await paperBox()
    assert(
      Math.abs(none.center - both.center) <= 2,
      `양쪽을 접자 원고가 밀림: ${both.center} → ${none.center}`
    )
    await page.click('.ws-tools button[title^="오른쪽 패널"]') // 오른쪽만 열기
    await page.waitForSelector('.rightpanel', { timeout: 3000 })
    const rightOnly = await paperBox()
    assert(
      Math.abs(rightOnly.center - both.center) <= 2,
      `오른쪽 패널만 열자 원고가 밀림: ${both.center} → ${rightOnly.center}`
    )
    assert(rightOnly.right <= rightOnly.rpLeft, `오른쪽 패널이 원고를 덮음: ${JSON.stringify(rightOnly)}`)
    await page.click('.ws-tools button[title^="바인더"]') // 둘 다 열림으로 복귀
    await page.waitForSelector('.binder', { timeout: 3000 })
    console.log('  ✓ 원고 고정: 둘 다/왼쪽만/오른쪽만/둘 다 닫힘 — 네 상태에서 원고 중심이 같다')

    await page.click('.ws-focus') // 집중 모드(양쪽 접기)
    await page.waitForSelector('.binder', { state: 'detached', timeout: 3000 })
    await page.waitForSelector('.rightpanel', { state: 'detached', timeout: 3000 })
    console.log('  ✓ 집중 모드: 양쪽 패널 접힘(원고만)')
    await page.click('.ws-focus')
    await page.waitForSelector('.binder', { timeout: 3000 })
    await page.waitForSelector('.rightpanel', { timeout: 3000 })
    console.log('  ✓ 집중 모드 해제: 패널 복원')

    /**
     * 끄면 예전처럼 남은 자리를 원고가 다 쓴다(좁은 창을 위한 탈출구).
     *
     * 좌우 패널 너비가 같아진 뒤로 **둘 다 열려 있으면 켜나 끄나 결과가 같다**(비울 차이가 0).
     * 그래서 차이가 나는 상태 — 한쪽만 열린 상태 — 에서 확인해야 한다. 토글이 오른쪽 패널에
     * 있으므로 접는 쪽은 바인더다.
     */
    await page.click('.ws-tools button[title^="바인더"]') // 왼쪽만 접기
    await page.waitForSelector('.binder', { state: 'detached', timeout: 3000 })
    const onRightOnly = await paperBox()
    await page.click('.rightpanel-tabs button:has-text("보기")')
    await page.click('.viewset .vs-switch:has-text("원고를 화면 가운데 고정") input')
    await page.waitForFunction(
      () => !document.querySelector('.main').classList.contains('center-paper'),
      undefined,
      { timeout: 3000 }
    )
    const off = await paperBox()
    assert(
      off.center !== onRightOnly.center,
      `고정을 꺼도 배치가 그대로임(토글이 안 먹음): ${off.center}`
    )
    console.log('  ✓ 원고 고정 끄기: 예전 배치(남은 자리를 원고가 다 씀)로 복귀')
    await page.click('.viewset .vs-switch:has-text("원고를 화면 가운데 고정") input') // 되돌리기
    await page.click('.ws-tools button[title^="바인더"]')
    await page.waitForSelector('.binder', { timeout: 3000 })

    /**
     * ── 섹션 갤러리 보기 전환(§6.2) — 세계관은 리스트형이 기본, 눌러서 표지형으로 ──
     * 세계관·노트는 대부분 그림이 없어 표지형이면 빈 카드만 늘어선다(사용자 지적).
     */
    await page.click('.binder-add[title="세계관 추가"]')
    await page.waitForSelector('.dialog-input', { timeout: 5000 })
    await page.fill('.dialog-input', '북방 왕국')
    await page.click('.dialog-confirm')
    await page.click('.binder-section-label:has-text("세계관")')
    await page.waitForSelector('.gallery', { timeout: 5000 })
    await page.waitForSelector('.gal-row', { timeout: 3000 })
    const listDefault = await page.evaluate(() => ({
      list: !!document.querySelector('.gal-list'),
      grid: !!document.querySelector('.gal-grid')
    }))
    assert(listDefault.list && !listDefault.grid, '세계관 기본 보기가 리스트형이 아님')
    console.log('  ✓ 갤러리: 세계관은 리스트형이 기본')

    await page.click('.gal-view button[title^="표지형"]')
    await page.waitForSelector('.gal-grid', { timeout: 3000 })
    console.log('  ✓ 갤러리: ▦ 를 누르면 표지형으로 전환')

    // 캐릭터는 얼굴이 표지가 되므로 표지형이 기본이어야 한다(섹션마다 기본이 다르다)
    await page.click('.binder-section-label:has-text("캐릭터")')
    await page.locator('.gal-card', { hasText: '김철수' }).waitFor({ timeout: 3000 })
    console.log('  ✓ 갤러리: 캐릭터는 표지형이 기본(섹션별 기본값)')

    // 다시 세계관 → 방금 고른 표지형이 그 섹션의 선택으로 기억돼 있다
    await page.click('.binder-section-label:has-text("세계관")')
    await page.locator('.gal-card', { hasText: '북방 왕국' }).waitFor({ timeout: 3000 })
    console.log('  ✓ 갤러리: 고른 보기가 섹션별로 기억됨(세계관=표지형)')

    // 기본 표지 색은 문서 타입을 따른다 — 그림이 없어도 어느 방의 문서인지 보인다
    const coverClass = await page.evaluate(() => document.querySelector('.gal-cover')?.className ?? '')
    assert(coverClass.includes('t-world'), `세계관 기본 표지에 타입 클래스가 없음: ${coverClass}`)
    console.log('  ✓ 갤러리: 기본 표지가 문서 타입별 색(t-world)')

    // ── 좌우 패널 너비가 같아야 한다(사용자 요청 — 오른쪽 기준) ──
    await page.click('.binder-section-label:has-text("원고")')
    const panelW = await page.evaluate(() => ({
      binder: Math.round(document.querySelector('.binder').getBoundingClientRect().width),
      right: Math.round(document.querySelector('.rightpanel').getBoundingClientRect().width)
    }))
    assert.equal(panelW.binder, panelW.right, `좌우 패널 너비가 다름: ${JSON.stringify(panelW)}`)
    console.log(`  ✓ 좌우 패널 너비 같음(${panelW.binder}px)`)

    // ── 제목 줄 위 여백 = 문단 간격의 3배(사용자 요청) ──
    await page.click('.binder-file:has-text("첫 장")')
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('앞 문단입니다.\n# 큰 제목\n제목 아래 문단.\n## 작은 제목')
    await page.locator('.cm-line', { hasText: '앞 문단' }).click() // 커서를 제목 밖으로
    const headGap = await page.evaluate(() => {
      const find = (t) =>
        [...document.querySelectorAll('.cm-line')].find((l) => (l.textContent || '').includes(t))
      const px = (v) => parseFloat(v)
      const gap = px(getComputedStyle(find('앞 문단')).paddingBottom)
      return {
        gap,
        h1: px(getComputedStyle(find('큰 제목')).paddingTop),
        h2: px(getComputedStyle(find('작은 제목')).paddingTop),
        body: px(getComputedStyle(find('제목 아래 문단')).paddingTop)
      }
    })
    assert(headGap.gap > 0, `문단 간격이 0이라 비교 불가: ${JSON.stringify(headGap)}`)
    assert(
      Math.abs(headGap.h1 - headGap.gap * 3) < 1 && Math.abs(headGap.h2 - headGap.gap * 3) < 1,
      `제목 위 여백이 문단 간격의 3배가 아님: ${JSON.stringify(headGap)}`
    )
    assert.equal(headGap.body, 0, `제목이 아닌 줄에 위 여백이 붙음: ${headGap.body}px`)
    console.log(`  ✓ 제목(#·##) 위 여백 = 문단 간격 ×3 (${headGap.gap}→${headGap.h1}px)`)

    // ── 따옴표 모양 통일(사용자 신고: 같은 글꼴인데 모양이 다르다 = 다른 글자다) ──
    await page.click('.rightpanel-tabs button:has-text("보기")')
    await page.click('.vs-quotestyle .vs-align button:has-text("둥근")')
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('"곧은 키로 친 대사.') // 자판의 " 로 치지만 둥근이 들어가야 한다
    const curly = await page.evaluate(() => document.querySelector('.cm-line')?.textContent ?? '')
    assert.equal(curly, '“곧은 키로 친 대사.”', `곧은 키가 둥근 짝으로 안 바뀜: ${JSON.stringify(curly)}`)
    console.log('  ✓ 따옴표 모양: 자판의 " 를 쳐도 둥근 “ ” 가 들어간다')

    // 섞여 있는 원고를 단추 한 번으로 통일 — 손으로 친 곧은 대사 + 둥근 대사가 섞인 상태를 만든다.
    // 먼저 '건드리지 않음'으로 돌려 놓아야 친 그대로 섞인다(통일 모드에서는 한쪽으로 모이므로).
    await page.click('.vs-quotestyle .vs-align button:has-text("건드리지")')
    await page.click('.cm-content')
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('"곧은 대사.')
    await page.keyboard.press('Enter') // 따옴표 밖으로 → 다음 줄
    await page.keyboard.type('“둥근 대사.')
    const mixed = await page.evaluate(() =>
      [...document.querySelectorAll('.cm-line')].map((l) => l.textContent)
    )
    assert.deepEqual(mixed, ['"곧은 대사."', '“둥근 대사.”'], `섞인 상태를 못 만듦: ${JSON.stringify(mixed)}`)

    await page.click('.rightpanel-tabs button:has-text("보기")')
    await page.click('.vs-quotestyle .vs-align button:has-text("둥근")')
    await page.click('.vs-quotestyle .vs-reset')
    const unified = await page.evaluate(() =>
      [...document.querySelectorAll('.cm-line')].map((l) => l.textContent)
    )
    assert.deepEqual(
      unified,
      ['“곧은 대사.”', '“둥근 대사.”'],
      `따옴표 통일이 안 됨: ${JSON.stringify(unified)}`
    )
    console.log('  ✓ 따옴표 모양: 섞인 원고를 단추 한 번으로 통일')
    await page.click('.vs-quotestyle .vs-align button:has-text("건드리지")') // 기본값 원복

    // ── AI 대화는 긁어서 복사할 수 있어야 한다(body의 user-select:none 예외) ──
    await page.click('.rightpanel-tabs button:has-text("AI")')
    await page.waitForSelector('.ai-messages', { timeout: 3000 })
    const aiSelect = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ai-messages')).userSelect
    )
    assert.equal(aiSelect, 'text', `AI 대화가 드래그로 안 긁힘(user-select: ${aiSelect})`)
    console.log('  ✓ AI 대화: 드래그 선택 가능(user-select: text)')

    /**
     * ── 자료(AI로 만든 그림) 삭제(§6.10, 사용자 요청) ──
     * 지우는 게 아니라 `trash/`로 **옮긴다** — 어느 챕터에 박혀 있었다면 되돌릴 수 있어야 한다.
     */
    await page.click('.rightpanel-tabs button:has-text("자료")')
    await page.click('.assets-tools button[title="새로고침"]')
    await page.waitForSelector('.asset-cell', { timeout: 5000 })
    const beforeCount = await page.locator('.asset-cell').count()
    // 어떤 파일이 첫 칸인지는 정렬에 달렸다 — 지울 그 파일의 이름을 미리 읽어 두고 대조한다.
    const victim = await page.getAttribute('.asset-cell:first-child .asset-tile', 'title')
    await page.locator('.asset-cell').first().hover()
    await page.click('.asset-cell:first-child .asset-trash')
    await page.waitForSelector('.dialog-message', { timeout: 4000 })
    const trashMsg = (await page.textContent('.dialog-message')) ?? ''
    assert(
      trashMsg.includes('휴지통') && trashMsg.includes('그대로 남습니다'),
      `삭제 확인 문구가 휴지통·본문 영향을 안 알림: ${trashMsg}`
    )
    await page.click('.dialog-confirm')
    await page.waitForFunction(
      (n) => document.querySelectorAll('.asset-cell').length === n - 1,
      beforeCount,
      { timeout: 6000 }
    )
    const trashed = await fs.readdir(join(bookDir, 'trash'))
    assert(
      trashed.includes(victim),
      `휴지통에 “${victim}”이 없음(있는 것: ${trashed.join(', ') || '없음'})`
    )
    console.log('  ✓ 자료 삭제: 확인 후 목록에서 빠지고 trash/로 옮겨짐(되돌릴 수 있음)')

    console.log(
      '\n✅ 에디터 E2E: 62개 검증 통과 (…+ 따옴표탈출·모양통일 + 서식×줄바꿈 + 원고 가운데 고정 + 패널 너비 + 제목 여백 + 갤러리 보기전환 + 자료 삭제)'
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
