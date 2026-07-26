/**
 * 검색 E2E — 실제 Electron 앱에서 (1) 에디터 찾기·바꾸기(Ctrl+F, 한국어 패널, 바꾸기가 저장
 * 파일까지 반영) (2) 책 전체 검색(Ctrl+Shift+F → 다른 문서 결과 클릭 → 그 위치로 점프)을 검증.
 * 정렬 단축키(Ctrl+Shift+L)와의 키 충돌 무회귀 확인 포함.
 *
 * 실행: npm run build 후  npm run test:search:e2e
 */
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-search-e2e-'))
  // ICEFICTION_E2E_EXE에 패키지 실행파일(release/win-unpacked/ICEFiction.exe)을 주면
  // 개발 빌드(out/)가 아니라 설치파일과 동일한 산출물로 스모크를 돈다.
  const exe = process.env.ICEFICTION_E2E_EXE
  const app = await electron.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: [...(exe ? [] : ['.']), `--user-data-dir=${join(home, 'userdata')}`],
    env: {
      ...process.env,
      ICEFICTION_DOCS: home,
      ICEFICTION_CONFIG: join(home, 'config.json')
    }
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.lib-new', { timeout: 15000 })

    // 새 소설 → 씨앗 챕터 열기
    await page.click('.lib-new')
    await page.waitForSelector('.dialog-input', { timeout: 5000 })
    await page.fill('.dialog-input', '검색북')
    await page.click('.dialog-confirm')
    await page.waitForSelector('.binder-file', { timeout: 8000 })
    await page.click('.binder-file')
    await page.waitForSelector('.cm-content[contenteditable="true"]', { timeout: 8000 })

    // 본문 채우기 — 바꾸기 대상 단어 2회 + 정렬 회귀용 문단
    await page.click('.cm-content')
    await page.keyboard.press('Control+A')
    await page.keyboard.type('임시이름이 걸었다. 임시이름이 웃었다.')
    await page.waitForTimeout(2600) // 자동 저장(2s 디바운스)

    // ── 1) 에디터 찾기·바꾸기 ──
    await page.keyboard.press('Control+f')
    await page.waitForSelector('.cm-panel.cm-search', { timeout: 4000 })
    const findPh = await page.getAttribute('.cm-panel.cm-search [name=search]', 'placeholder')
    assert.equal(findPh, '찾기', `검색 패널이 한국어가 아님: ${findPh}`)
    console.log('  ✓ Ctrl+F → 검색 패널(한국어) 표시')

    // CM 패널 입력은 keyup/change로만 커밋된다. fill()은 키 이벤트가 없고, 한글은 keyboard.type도
    // insertText 경로라 키 이벤트가 없다 → 타이핑 뒤 무해한 키(End)로 keyup을 일으켜 커밋시킨다.
    await page.click('.cm-panel.cm-search [name=search]')
    await page.keyboard.type('임시이름')
    await page.keyboard.press('End')
    await page.waitForSelector('.cm-searchMatch', { timeout: 3000 })
    const matchCount = await page.locator('.cm-searchMatch').count()
    assert.equal(matchCount, 2, `매치 하이라이트 수: ${matchCount}`)
    console.log('  ✓ 검색어 입력 → 본문 매치 2건 하이라이트')

    await page.click('.cm-panel.cm-search [name=replace]')
    await page.keyboard.type('유리케')
    await page.keyboard.press('End') // 위와 같은 이유 — keyup으로 바꿀 문자열 커밋
    await page.click('.cm-panel.cm-search button:has-text("모두 바꾸기")')
    const text1 = (await page.textContent('.cm-content')) ?? ''
    assert(text1.includes('유리케이 걸었다') && text1.includes('유리케이 웃었다'), `바꾸기 미반영: ${text1}`)
    assert(!text1.includes('임시이름'), '원래 단어가 남아 있음')
    console.log('  ✓ 모두 바꾸기 → 에디터 본문 교체')

    // 바꾼 내용이 자동 저장으로 디스크 파일까지 반영
    await page.waitForTimeout(2600)
    const mdDir = join(home, 'ICEFiction', '검색북', 'manuscript')
    const chapterFile = (await fs.readdir(mdDir)).filter((f) => f.endsWith('.md'))[0]
    const raw1 = await fs.readFile(join(mdDir, chapterFile), 'utf8')
    assert(raw1.includes('유리케이 걸었다'), `저장 파일에 바꾼 텍스트 없음:\n${raw1}`)
    console.log('  ✓ 바꾸기 결과가 저장 파일에 반영')

    await page.keyboard.press('Escape')
    await page.waitForSelector('.cm-panel.cm-search', { state: 'detached', timeout: 3000 })
    console.log('  ✓ Esc → 검색 패널 닫힘')

    // 키 충돌 무회귀 — Ctrl+Shift+L은 여전히 '왼쪽 정렬'이어야 한다(searchKeymap에서 제외했으므로)
    await page.click('.cm-content')
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Control+Shift+L')
    await page.waitForTimeout(2600) // 자동 저장
    const raw2 = await fs.readFile(join(mdDir, chapterFile), 'utf8')
    assert(raw2.includes('<div align="left">'), `Ctrl+Shift+L이 정렬로 동작하지 않음:\n${raw2}`)
    console.log('  ✓ Ctrl+Shift+L = 왼쪽 정렬 유지(searchKeymap 충돌 없음)')

    // ── 2) 책 전체 검색 ──
    // 다른 섹션(노트)에 같은 단어가 든 문서를 디스크에 직접 심는다 — searchAll은 파일을 매번
    // 스캔하므로(설계 D1) 바인더 갱신 없이도 검색에 잡혀야 한다.
    const noteBody = ['---', 'type: note', 'title: 단서', '---', '유리케의 반지는 서고 깊은 곳에 있다.'].join('\n')
    await fs.writeFile(join(home, 'ICEFiction', '검색북', 'notes', '단서.md'), noteBody)

    await page.keyboard.press('Control+Shift+F')
    await page.waitForSelector('.search-panel', { timeout: 4000 })
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    assert.equal(focused, 'INPUT', `검색 입력창에 포커스 안 됨: ${focused}`)
    console.log('  ✓ Ctrl+Shift+F → 검색 탭 + 입력 포커스')

    await page.fill('.search-panel .search-head input[type=text]', '유리케')
    await page.waitForSelector('.search-file', { timeout: 4000 })
    const fileCount = await page.locator('.search-file').count()
    assert.equal(fileCount, 2, `검색된 문서 수: ${fileCount} (원고+노트 2개여야 함)`)
    const summary = (await page.textContent('.search-summary')) ?? ''
    assert(summary.includes('3건'), `총 매치 수 표기 이상: ${summary}`) // 원고 2 + 노트 1
    console.log('  ✓ 전체 검색: 두 섹션에서 문서 2개·매치 3건')

    // 노트 문서의 매치 클릭 → 그 문서가 열리고 해당 단어가 선택된 채 표시
    const noteFile = page.locator('.search-file', { hasText: '단서' })
    await noteFile.locator('.search-match').first().click()
    await page.waitForFunction(
      () => document.querySelector('.sb-path')?.textContent?.includes('단서.md'),
      undefined,
      { timeout: 5000 }
    )
    const selected = await page.evaluate(() => window.getSelection()?.toString())
    assert.equal(selected, '유리케', `점프 후 선택 텍스트: "${selected}"`)
    console.log('  ✓ 결과 클릭 → 다른 섹션 문서 열림 + 매치 위치 선택')

    console.log('\n✅ 검색 E2E: 9개 검증 통과')
  } finally {
    await app.close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ E2E 실패:', err)
  process.exit(1)
})
