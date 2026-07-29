/**
 * 이미지 생성 E2E — 배선 전체를 실제 Electron 창에서 검증한다(§7.6).
 *
 * 실제 CLI(agy·codex)는 그림 한 장에 1~2분이 걸리고 사용량을 먹는다. 그래서 엔진 호출만
 * ICEFICTION_IMAGE_STUB(PNG 경로)으로 갈음하고, **그 앞뒤 배선을 전부 진짜로 돌린다**:
 *   IPC → 저장 위치 → 프론트매터 첨부 → 갤러리 표지 → 표지 아트 → 캔버스 제목 합성 → cover.png 저장
 *
 * ★ 여기서만 잡히는 버그: 표지 아트를 <canvas>에 그린 뒤 toDataURL()을 부르면 ice-cover가 다른
 *   오리진이라 캔버스가 오염돼 SecurityError가 난다(CORS 헤더 + crossOrigin 필요). 타입·빌드는 통과한다.
 *
 * 실행: npm run build 후  npm run test:image:e2e
 */
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

/** CRC32 — PNG 청크용. */
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * 진짜 PNG를 만든다(단색 RGB). 스텁을 **실제 표지 크기(1024x1536)** 로 두어야
 * 캔버스 합성·파일 크기가 프로덕션과 같은 조건에서 검증된다.
 */
function makePng(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y += 1) {
    const row = y * (w * 3 + 1)
    raw[row] = 0 // filter: none
    for (let x = 0; x < w; x += 1) {
      const p = row + 1 + x * 3
      raw[p] = r
      raw[p + 1] = g
      raw[p + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-img-e2e-'))
  const stub = join(home, 'stub.png')
  await fs.writeFile(stub, makePng(1024, 1536, [40, 60, 110])) // 실제 표지 비율의 진짜 PNG

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(home, 'userdata')}`],
    env: {
      ...process.env,
      ICEFICTION_DOCS: home,
      ICEFICTION_CONFIG: join(home, 'config.json'),
      ICEFICTION_IMAGE_STUB: stub // ← 엔진만 갈음
    }
  })
  try {
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForSelector('.lib-new', { timeout: 15000 })

    // 엔진 감지 API가 살아 있는지(설치 여부와 무관하게 목록을 돌려줘야 한다)
    const engines = await page.evaluate(() => window.api.imageEngines())
    assert(Array.isArray(engines) && engines.length >= 2, `엔진 목록 이상: ${JSON.stringify(engines)}`)
    console.log('  ✓ 이미지 엔진 감지 API')

    // 새 책
    await page.click('.lib-new')
    await page.waitForSelector('.dialog-input', { timeout: 5000 })
    await page.fill('.dialog-input', '그림책')
    await page.click('.dialog-confirm')
    await page.waitForSelector('.gallery', { timeout: 8000 })

    // ── 1) 캐릭터 이미지 생성 ──
    await page.click('.binder-add[title="캐릭터 추가"]')
    await page.waitForSelector('.dialog-input', { timeout: 5000 })
    await page.fill('.dialog-input', '김철수')
    await page.click('.dialog-confirm')
    // 만들기가 끝나 바인더에 실제로 나타난 뒤에 연다 — 바로 클릭하면 아직 없는 문서를 집는다.
    await page.waitForSelector('.binder-file:has-text("김철수")', { timeout: 8000 })
    await page.click('.binder-file:has-text("김철수")')
    await page.click('.rightpanel-tabs button:has-text("인스펙터")')

    await page.click('.insp-gen-image')
    await page.waitForSelector('.studio', { timeout: 5000 })
    // 시트에서 뽑은 프롬프트 초안이 채워져 있어야 한다.
    // ★ 곧바로 읽지 말 것 — .studio 가 붙는 시점과 초안이 state로 반영되는 시점이 다르다.
    //   즉시 읽으면 빈 문자열이 잡혀 "초안이 안 만들어졌다"고 오진한다(2026-07-29 실측).
    await page
      .waitForFunction(
        () => (document.querySelector('.studio-left textarea')?.value ?? '').includes('김철수'),
        undefined,
        { timeout: 5000 }
      )
      .catch(async () => {
        const got = await page.inputValue('.studio-left textarea')
        assert.fail(`프롬프트 초안에 문서 이름이 없음: ${JSON.stringify(got)}`)
      })
    console.log('  ✓ 스튜디오 열림 + 시트 기반 프롬프트 초안')

    await page.click('.studio-actions .dialog-confirm') // 그리기
    await page.waitForSelector('.studio-preview', { timeout: 20000 })
    console.log('  ✓ 캐릭터 이미지 생성 → 미리보기')

    await page.click('.studio-head button') // 닫기
    await page.waitForTimeout(2800) // 자동저장

    // 파일이 assets/images/에 생기고 프론트매터 images에 붙었는가
    const bookDir = join(home, 'ICEFiction', '그림책')
    await fs.access(join(bookDir, 'assets', 'images', '김철수.png'))
    const md = await fs.readFile(join(bookDir, 'characters', '김철수.md'), 'utf8')
    assert(
      md.includes('images:') && md.includes('assets/images/김철수.png'),
      `프론트매터에 생성 이미지가 안 붙음:\n${md}`
    )
    console.log('  ✓ assets/images/ 저장 + 프론트매터 images 첨부')

    // 갤러리 표지로 뜨는가
    await page.click('.binder-section-label:has-text("캐릭터")')
    await page.waitForSelector('.gal-cover-img', { timeout: 5000 })
    console.log('  ✓ 생성 이미지가 캐릭터 갤러리 표지로 렌더')

    // ── 2) 표지 생성 + 제목 합성 ──
    await page.click('.ws-back') // 서재로
    await page.waitForSelector('.book-card', { timeout: 8000 })
    await page.hover('.book-card') // 카드 도구는 hover에서만 보인다(display:none)
    await page.click('.book-tools button[title^="AI로 표지"]')
    await page.waitForSelector('.studio', { timeout: 5000 })
    // 표지 초안은 getBookMeta(비동기) 뒤에 채워진다 — 빈 프롬프트로 그리기를 누르지 않도록 기다린다.
    await page.waitForFunction(
      () => (document.querySelector('.studio-left textarea')?.value ?? '').length > 0,
      undefined,
      { timeout: 5000 }
    )
    console.log('  ✓ 표지 스튜디오 열림')

    await page.click('.studio-actions .dialog-confirm') // 그리기
    await page.waitForSelector('.studio-title-controls', { timeout: 20000 })
    // 표지 아트가 캔버스에 실제로 그려졌는지(픽셀이 있는지)
    const drawn = await page.evaluate(() => {
      const cv = document.querySelector('.studio-canvas')
      return cv ? { w: cv.width, h: cv.height } : null
    })
    assert(drawn && drawn.w > 0 && drawn.h > 0, `표지 캔버스가 비어 있음: ${JSON.stringify(drawn)}`)
    console.log(`  ✓ 표지 아트 생성 → 캔버스 렌더 (${drawn.w}x${drawn.h})`)

    // ★ 캔버스 오염(tainted) 검사 — CORS/crossOrigin이 빠지면 여기서 SecurityError가 난다
    const canExport = await page.evaluate(() => {
      const cv = document.querySelector('.studio-canvas')
      try {
        const d = cv.toDataURL('image/png')
        return { ok: true, len: d.length }
      } catch (e) {
        return { ok: false, err: String(e) }
      }
    })
    assert(
      canExport.ok,
      `캔버스가 오염돼 표지를 저장할 수 없음(CORS 누락): ${canExport.err}`
    )
    console.log('  ✓ 캔버스 오염 없음 — toDataURL 가능(CORS 헤더 + crossOrigin)')

    // 제목을 얹어 저장
    await page.click('.studio-title-controls .dialog-confirm')
    await page.waitForSelector('.studio', { state: 'detached', timeout: 10000 })

    // cover.png(제목 합성본) + cover-art.png(원본 아트) 둘 다 있어야 한다
    const coverBuf = await fs.readFile(join(bookDir, 'cover.png'))
    const artBuf = await fs.readFile(join(bookDir, 'cover-art.png'))
    assert(coverBuf.subarray(1, 4).toString() === 'PNG', '표지가 PNG가 아님')
    assert(coverBuf.length > 1000, `합성된 표지가 비어 있음 (${coverBuf.length}B)`)
    // 제목을 얹었으니 원본 아트와 픽셀이 달라야 한다(제목이 안 그려졌으면 여기서 걸린다)
    assert(!coverBuf.equals(artBuf), '표지가 원본 아트와 동일 — 제목이 합성되지 않음')
    const manifest = JSON.parse(await fs.readFile(join(bookDir, 'icefiction.json'), 'utf8'))
    assert.equal(manifest.cover, 'cover.png', '매니페스트 cover 미기록')
    assert.equal(manifest.coverArt, 'cover-art.png', '매니페스트 coverArt 미기록(제목 재조판 불가)')
    console.log('  ✓ 표지 저장: cover.png(제목 합성) + cover-art.png(원본 아트 보존)')

    // 책장 카드에 합성 표지가 뜨는가
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.book-card .book-cover-img')
        return !!img && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 6000 }
    )
    console.log('  ✓ 책장 카드에 합성 표지 렌더')

    // ── 본문 삽화(§6.1b) + 비율 크롭(§7.6) ──
    // 엔진은 2:3(1024x1536)만 뱉는 스텁이다. 16:9를 요청하면 앱이 중앙을 잘라 비율을 맞춰야 한다.
    const inline = await page.evaluate(async () => {
      const done = new Promise((resolve) => window.api.onImageDone((d) => resolve(d)))
      await window.api.generateImage({
        requestId: 'inline-1',
        target: { kind: 'inline', path: 'manuscript/01-첫-장.md' },
        prompt: '비 내리는 항구',
        ratio: '16:9',
        engine: 'auto'
      })
      return done
    })
    assert.equal(inline.path, 'assets/images/01-첫-장-1.png', `본문 삽화 경로 오류: ${inline.path}`)
    const png = await fs.readFile(join(bookDir, 'assets', 'images', '01-첫-장-1.png'))
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)
    assert(
      Math.abs(w / h - 16 / 9) / (16 / 9) < 0.02,
      `16:9로 잘리지 않음: ${w}x${h} (비율 ${(w / h).toFixed(3)})`
    )
    assert.equal(w, 1024, `가로는 원본 그대로여야 한다: ${w}`)
    console.log(`  ✓ 본문 삽화: 번호 붙은 파일 + 16:9 자동 크롭 (${w}x${h})`)

    assert.equal(errors.length, 0, `런타임 에러: ${errors.join(' | ')}`)
    console.log('\n✅ 이미지 생성 E2E: 9개 검증 통과 (엔진만 스텁, 배선은 전부 실제)')
  } finally {
    await app.close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ 이미지 E2E 실패:', err)
  process.exit(1)
})
