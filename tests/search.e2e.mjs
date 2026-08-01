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

/** 수정 키 — CodeMirror의 `Mod-` 는 mac에서 Cmd, 그 외에서 Ctrl(editor.e2e.mjs와 같은 이유). */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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
    await page.keyboard.press(`${MOD}+A`)
    await page.keyboard.type('임시이름이 걸었다. 임시이름이 웃었다.')
    await page.waitForTimeout(2600) // 자동 저장(2s 디바운스)

    // ── 1) 에디터 찾기·바꾸기 ──
    await page.keyboard.press(`${MOD}+f`)
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
    await page.keyboard.press(`${MOD}+End`)
    await page.keyboard.press(`${MOD}+Shift+L`)
    await page.waitForTimeout(2600) // 자동 저장
    const raw2 = await fs.readFile(join(mdDir, chapterFile), 'utf8')
    assert(raw2.includes('<div align="left">'), `Ctrl+Shift+L이 정렬로 동작하지 않음:\n${raw2}`)
    console.log('  ✓ Ctrl+Shift+L = 왼쪽 정렬 유지(searchKeymap 충돌 없음)')

    // ── 2) 책 전체 검색 ──
    // 다른 섹션(노트)에 같은 단어가 든 문서를 디스크에 직접 심는다 — searchAll은 파일을 매번
    // 스캔하므로(설계 D1) 바인더 갱신 없이도 검색에 잡혀야 한다.
    const noteBody = ['---', 'type: note', 'title: 단서', '---', '유리케의 반지는 서고 깊은 곳에 있다.'].join('\n')
    await fs.writeFile(join(home, 'ICEFiction', '검색북', 'notes', '단서.md'), noteBody)

    await page.keyboard.press(`${MOD}+Shift+F`)
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

    /**
     * ── 3) 책 전체 모두 바꾸기(§6.9) ──
     * 임시 이름을 진짜 이름으로 한 번에 고치는, 소설에서 가장 흔한 대량 수정. 검증 지점은 네 가지다.
     *  ① 여러 섹션의 파일이 **디스크에서** 실제로 바뀐다
     *  ② 지금 **열려 있는 문서**도 화면이 갱신된다(안 그러면 뒤늦은 자동 저장이 옛 본문을 되돌린다)
     *  ③ 되돌릴 원본이 .backups/에 남는다
     *  ④ 바꾼 뒤 같은 말로 다시 찾으면 결과가 없다
     */
    const bookDir = join(home, 'ICEFiction', '검색북')
    await page.fill('.search-panel .search-head input[type=text]', '유리케')
    await page.waitForSelector('.search-file', { timeout: 4000 })
    await page.fill('.search-replace', '세이라')
    await page.click('.search-replace-all')
    await page.waitForSelector('.dialog-message', { timeout: 4000 })
    const confirmMsg = (await page.textContent('.dialog-message')) ?? ''
    assert(
      confirmMsg.includes('2개') && confirmMsg.includes('3곳'),
      `확인 문구에 바뀔 문서·건수가 없음: ${confirmMsg}`
    )
    assert(confirmMsg.includes('.backups/'), `확인 문구에 백업 안내가 없음: ${confirmMsg}`)
    console.log('  ✓ 모두 바꾸기: 실행 전에 문서 수·건수·백업을 알리고 확인받는다')

    await page.click('.dialog-confirm')
    await page.waitForSelector('.search-replaced', { timeout: 8000 })
    const replacedMsg = (await page.textContent('.search-replaced')) ?? ''
    assert(replacedMsg.includes('3곳'), `바꾼 건수 표기 이상: ${replacedMsg}`)

    const rawNote = await fs.readFile(join(bookDir, 'notes', '단서.md'), 'utf8')
    const rawChapter = await fs.readFile(join(mdDir, chapterFile), 'utf8')
    assert(rawNote.includes('세이라의 반지'), `노트 파일이 안 바뀜:\n${rawNote}`)
    assert(!rawNote.includes('유리케'), `노트에 옛 이름이 남음:\n${rawNote}`)
    assert(rawChapter.includes('세이라이 걸었다'), `원고 파일이 안 바뀜:\n${rawChapter}`)
    assert(rawNote.includes('title: 단서'), `프론트매터가 깨짐:\n${rawNote}`)
    console.log('  ✓ 모두 바꾸기: 두 섹션의 파일이 디스크에서 실제로 바뀜(프론트매터 보존)')

    // 열려 있던 문서(단서.md)의 화면도 갱신됐는가 — 갱신 안 되면 자동 저장이 옛 본문을 되돌린다
    const shownAfter = (await page.textContent('.cm-content')) ?? ''
    assert(
      shownAfter.includes('세이라') && !shownAfter.includes('유리케'),
      `열린 문서 화면이 옛 본문 그대로: ${shownAfter}`
    )
    await page.waitForTimeout(2600) // 자동 저장이 돌아도 되돌아가지 않아야 한다
    const rawNoteAgain = await fs.readFile(join(bookDir, 'notes', '단서.md'), 'utf8')
    assert(!rawNoteAgain.includes('유리케'), `뒤늦은 자동 저장이 옛 본문으로 되돌림:\n${rawNoteAgain}`)
    console.log('  ✓ 모두 바꾸기: 열린 문서도 갱신 — 뒤늦은 자동 저장이 되돌리지 않는다')

    // 되돌릴 원본이 남아 있는가(.backups/replace-<시각>/notes/단서.md)
    const backupRoot = join(bookDir, '.backups')
    const stamps = await fs.readdir(backupRoot)
    assert(stamps.length === 1 && stamps[0].startsWith('replace-'), `백업 폴더 이상: ${stamps}`)
    const backedUp = await fs.readFile(join(backupRoot, stamps[0], 'notes', '단서.md'), 'utf8')
    assert(backedUp.includes('유리케의 반지'), `백업에 원본이 없음:\n${backedUp}`)
    console.log('  ✓ 모두 바꾸기: 바꾸기 직전 원본이 .backups/에 남는다(되돌릴 거리)')

    // 백업 폴더는 바인더·검색에 새지 않는다(점으로 시작하는 폴더는 모두 건너뛴다)
    await page.fill('.search-panel .search-head input[type=text]', '유리케')
    await page.waitForTimeout(600)
    const leftover = await page.locator('.search-file').count()
    assert.equal(leftover, 0, `바꾼 뒤에도 옛 이름이 검색됨(백업이 샜을 수 있음): ${leftover}개 문서`)
    console.log('  ✓ 모두 바꾸기: 옛 이름은 더 안 잡힌다(백업 폴더는 검색에서 제외)')

    console.log('\n✅ 검색 E2E: 14개 검증 통과 (…+ 책 전체 모두 바꾸기 + 백업 안전망)')
  } finally {
    await app.close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ E2E 실패:', err)
  process.exit(1)
})
