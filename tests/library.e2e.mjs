/**
 * 책장(서재) E2E — 표지 렌더(ice-cover:// 프로토콜)·제목 검색·수동 정렬 영속을 실제 Electron 창에서 검증.
 * 표지 지정은 네이티브 파일 대화상자를 쓰므로, 여기선 표지 파일을 디스크에 미리 심어 "렌더"를 확인한다.
 *
 * 실행: npm run build 후  node tests/library.e2e.mjs
 */
import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

/** 서재 안에 책 폴더 하나를 손으로 심는다(매니페스트 + 씨앗 챕터, 선택적 표지). */
async function seedBook(libDir, id, title, withCover) {
  const folder = join(libDir, id)
  await fs.mkdir(join(folder, 'manuscript'), { recursive: true })
  const manifest = {
    schemaVersion: 1,
    title,
    createdAt: new Date().toISOString(),
    sections: ['manuscript', 'characters', 'world', 'notes']
  }
  if (withCover) {
    await fs.writeFile(join(folder, 'cover.png'), PNG)
    manifest.cover = 'cover.png'
  }
  await fs.writeFile(join(folder, 'icefiction.json'), JSON.stringify(manifest, null, 2))
  await fs.writeFile(join(folder, 'manuscript', '01.md'), '---\ntitle: 1장\n---\n내용\n')
}

async function main() {
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-lib-e2e-'))
  const libDir = join(home, 'ICEFiction')
  await fs.mkdir(libDir, { recursive: true })
  await seedBook(libDir, '알파', '알파', true) // 표지 있음
  await seedBook(libDir, '베타', '베타', false) // 표지 없음(기본 표지)

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${join(home, 'userdata')}`],
    env: {
      ...process.env,
      ICEFICTION_DOCS: home,
      ICEFICTION_CONFIG: join(home, 'config.json')
    }
  })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('.book-card', { timeout: 15000 })
    const cardCount = () => page.locator('.book-card').count()
    assert.equal(await cardCount(), 2, '책 2권이 안 보임')
    console.log('  ✓ 책장에 심은 책 2권 표시')

    // 표지 있는 책 → ice-cover:// 로 실제 이미지가 로드되는지(주소만 들어오는 게 아니라 픽셀 로드)
    await page.waitForFunction(
      () => {
        const img = document.querySelector('.book-card[title="알파"] .book-cover-img')
        return !!img && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 6000 }
    )
    console.log('  ✓ 표지 렌더: ice-cover:// 프로토콜로 실제 이미지 로드')

    // 표지 없는 책 → 기본 표지(❄) 마크, 이미지 없음
    const betaHasMark = await page.evaluate(() => {
      const card = document.querySelector('.book-card[title="베타"]')
      return !!card?.querySelector('.book-cover-mark') && !card.querySelector('.book-cover-img')
    })
    assert(betaHasMark, '표지 없는 책이 기본 표지(❄)로 안 보임')
    console.log('  ✓ 표지 없는 책 → 기본 표지(❄)')

    // 제목 검색 — '알파' 입력 시 1권만
    await page.fill('.lib-search', '알파')
    await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 1, undefined, {
      timeout: 4000
    })
    const shownTitle = await page.getAttribute('.book-card', 'title')
    assert.equal(shownTitle, '알파', `검색 결과가 틀림: ${shownTitle}`)
    await page.fill('.lib-search', '')
    await page.waitForFunction(() => document.querySelectorAll('.book-card').length === 2, undefined, {
      timeout: 4000
    })
    console.log('  ✓ 제목 검색: 필터 + 초기화')

    // 수동 정렬 영속 — API로 순서를 [베타, 알파]로 바꾸고 새로고침 후에도 그 순서 유지
    await page.evaluate(() => window.api.reorderBooks(['베타', '알파']))
    await page.reload()
    await page.waitForSelector('.book-card', { timeout: 8000 })
    const firstTitle = await page.getAttribute('.book-card', 'title')
    assert.equal(firstTitle, '베타', `재정렬(order) 영속 실패 — 첫 카드: ${firstTitle}`)
    console.log('  ✓ 수동 정렬(order) 새로고침 후에도 유지')

    console.log('\n✅ 책장 E2E: 5개 검증 통과 (표지 렌더 + 기본표지 + 검색 + 재정렬 영속)')
  } finally {
    await app.close()
    await fs.rm(home, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('❌ 책장 E2E 실패:', err)
  process.exit(1)
})
