/**
 * ProjectService 스모크 — 폴더 생성·문서 왕복·프론트매터 보존·자료 반입·경로 가드.
 * 실행: npm test  (tsx로 직접 구동, electron 불필요)
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

/** 최소 유효 PDF(텍스트 1줄) — unpdf 추출 경로 검증용. */
function minimalPdf(text: string): Buffer {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    (() => {
      const s = `BT /F1 24 Tf 40 100 Td (${text}) Tj ET`
      return `<</Length ${s.length}>>\nstream\n${s}\nendstream`
    })(),
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ]
  let pdf = '%PDF-1.4\n'
  const offs: number[] = []
  objs.forEach((b, i) => {
    offs.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${b}\nendobj\n`
  })
  const xs = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const o of offs) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xs}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

// 1x1 투명 PNG(실제 바이트).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

async function main(): Promise<void> {
  const root = await fs.mkdtemp(join(tmpdir(), 'icefic-'))
  const svc = new ProjectService()

  // 1) create — 표준 폴더 + 매니페스트 + 씨앗 챕터
  const summary = await svc.create(root, '테스트소설')
  assert.equal(summary.manifest.title, '테스트소설')
  assert.equal(summary.manifest.schemaVersion, 1)
  for (const d of ['manuscript', 'characters', 'world', 'assets/images', 'trash']) {
    await fs.access(join(root, d))
  }
  // 세계관 하위 카테고리는 기본 생성하지 않는다(사용자가 만든다)
  await assert.rejects(() => fs.access(join(root, 'world', 'locations')))
  ok('create: 표준 폴더 구조 + 매니페스트 (세계관은 빈 폴더)')

  // createFolder — 세계관 사용자 카테고리 생성
  const tree0 = await svc.createFolder('world', '마법체계')
  const world0 = tree0.find((n) => n.path === 'world')
  assert(world0?.children?.some((c) => c.isDir && c.name === '마법체계'), '세계관 카테고리 생성 실패')
  ok('createFolder: 세계관 카테고리(폴더) 사용자 생성')

  // 2) 씨앗 챕터가 트리에 있고 읽힌다
  const manuscript = summary.tree.find((n) => n.path === 'manuscript')
  assert(manuscript && manuscript.children && manuscript.children.length === 1)
  const seedPath = manuscript.children[0].path
  assert.equal(seedPath, 'manuscript/01-첫-장.md')
  const seed = await svc.readDoc(seedPath)
  assert.equal(seed.frontmatter.type, 'chapter')
  assert.equal(seed.frontmatter.title, '첫 장')
  assert.match(seed.body, /여기서부터/)
  ok('read: 씨앗 챕터 프론트매터 + 본문')

  // 3) 저장 왕복 + 미지 프론트매터 키 보존
  await svc.saveDoc({
    path: seedPath,
    frontmatter: {
      type: 'chapter',
      title: '폭우',
      status: 'revising',
      pov: '김철수',
      wordsTarget: 5000,
      extra: { mood: '긴장' }
    },
    body: '비가 쏟아지기 시작했다.\n'
  })
  const back = await svc.readDoc(seedPath)
  assert.equal(back.frontmatter.title, '폭우')
  assert.equal(back.frontmatter.status, 'revising')
  assert.equal(back.frontmatter.wordsTarget, 5000)
  assert.deepEqual(back.frontmatter.extra, { mood: '긴장' })
  assert.equal(back.body.trim(), '비가 쏟아지기 시작했다.')
  ok('save/read 왕복 + 커스텀 키(extra) 보존')

  // 4) 파일에 실제로 snake_case로 기록됐는지(외부 에디터 호환)
  const rawOnDisk = await fs.readFile(join(root, seedPath), 'utf8')
  assert.match(rawOnDisk, /words_target: 5000/)
  assert.match(rawOnDisk, /mood: 긴장/)
  ok('디스크에 snake_case(words_target) + 커스텀 키 기록')

  // 5) createDoc — 캐릭터 생성 후 트리 반영
  const tree = await svc.createDoc('characters', 'character', '김철수')
  const chars = tree.find((n) => n.path === 'characters')
  assert(chars?.children?.some((c) => c.name === '김철수'))
  ok('createDoc: 캐릭터 생성 + 트리 반영')

  // 6) ingest — 임시 이미지 파일을 assets/images로 반입(상대 POSIX 경로)
  const srcImg = join(root, 'src-face.png')
  await fs.writeFile(srcImg, 'fake-png-bytes')
  const res = await svc.ingest([srcImg])
  assert.equal(res.imported.length, 1)
  assert.equal(res.imported[0], 'assets/images/src-face.png')
  await fs.access(join(root, res.imported[0]))
  ok('ingest: assets/images로 복사 + 상대 POSIX 경로')

  // 7) 경로 탈출 가드 — 프로젝트 밖 접근 차단
  await assert.rejects(() => svc.readDoc('../secret.txt'))
  ok('경로 가드: 프로젝트 밖(`..`) 접근 차단')

  // 8) AI 컨텍스트 빌더 — 현재 장면 + 등장 캐릭터 자동 감지 + 시놉시스 체인(§7.2)
  await svc.saveDoc({
    path: 'characters/김철수.md',
    frontmatter: { type: 'character', title: '김철수' },
    body: '전직 형사. 비를 싫어한다.'
  })
  await svc.saveDoc({
    path: seedPath,
    frontmatter: { type: 'chapter', title: '폭우', synopsis: '철수가 빗속에서 재회한다', order: 1 },
    body: '비가 쏟아졌다. 김철수는 우산을 폈다.'
  })
  const ctx = await svc.buildAiContext(seedPath, '비가 쏟아졌다. 김철수는 우산을 폈다.')
  assert(ctx.chips.some((c) => c.kind === 'scene'), '현재 장면 칩 없음')
  assert(ctx.chips.some((c) => c.kind === 'character' && c.label === '김철수'), '등장 캐릭터 감지 실패')
  assert(ctx.chips.some((c) => c.kind === 'synopsis'), '시놉시스 체인 없음')
  assert(ctx.text.includes('전직 형사'), '캐릭터 시트 내용 미포함')
  assert(ctx.estTokens > 0, '토큰 추정 0')
  ok('buildAiContext: 현재 장면 + 캐릭터 자동감지 + 시놉시스 체인')

  // 9) 본문에 이름이 없으면 그 캐릭터는 포함 안 함
  const ctx2 = await svc.buildAiContext(seedPath, '아무도 없는 텅 빈 방.')
  assert(!ctx2.chips.some((c) => c.kind === 'character'), '미등장 캐릭터가 잘못 포함됨')
  ok('buildAiContext: 미등장 캐릭터는 제외')

  // 9b) 별칭(aliases) 감지 — 본문에 실명은 없고 별칭만 있어도 캐릭터 시트 포함(§7.2)
  await svc.saveDoc({
    path: 'characters/김철수.md',
    frontmatter: { type: 'character', title: '김철수', aliases: ['형사', '철수'] },
    body: '전직 형사. 비를 싫어한다.'
  })
  const ctxA = await svc.buildAiContext(seedPath, '그 형사가 조용히 문을 열었다.')
  assert(
    ctxA.chips.some((c) => c.kind === 'character' && c.label === '김철수'),
    '별칭(형사)으로 캐릭터 감지 실패'
  )
  assert(ctxA.text.includes('별칭: 형사'), '별칭 표기 미포함')
  // 별칭도 실명도 없으면 여전히 제외
  const ctxB = await svc.buildAiContext(seedPath, '낯선 사람이 서 있었다.')
  assert(!ctxB.chips.some((c) => c.kind === 'character'), '별칭 없는데도 잘못 포함')
  ok('buildAiContext: 별칭으로 캐릭터 자동 감지')

  // 9c) 시놉시스 없는 챕터도 전체 흐름에 포함(스켈레톤) — "(줄거리 미작성)"으로 표기
  await svc.createDoc('manuscript', 'chapter', '02-둘째-장')
  await svc.saveDoc({
    path: 'manuscript/02-둘째-장.md',
    frontmatter: { type: 'chapter', title: '둘째 장', order: 2 }, // 시놉시스 없음
    body: '아직 쓰지 않은 장.'
  })
  const ctxC = await svc.buildAiContext(seedPath, '비가 쏟아졌다. 김철수는 우산을 폈다.')
  assert(ctxC.text.includes('둘째 장'), '시놉시스 없는 챕터가 흐름에서 누락')
  assert(ctxC.text.includes('(줄거리 미작성)'), '줄거리 미작성 표기 없음')
  assert(
    ctxC.chips.some((c) => c.kind === 'synopsis' && /줄거리 1/.test(c.label)),
    `흐름 칩이 줄거리 개수 미표기: ${JSON.stringify(ctxC.chips.filter((c) => c.kind === 'synopsis'))}`
  )
  ok('buildAiContext: 시놉시스 없는 챕터도 흐름에 포함 + 줄거리 수 표기')

  // 10) 이름 변경 — 파일명 + 프론트매터 title
  const treeR = await svc.renameEntry('characters/김철수.md', '이영희')
  const charsR = treeR.find((n) => n.path === 'characters')
  assert(charsR?.children?.some((c) => c.name === '이영희'), '이름 변경 실패')
  assert(!charsR?.children?.some((c) => c.name === '김철수'), '옛 이름 잔존')
  ok('renameEntry: 문서 이름 변경')

  // 11) 카테고리(폴더) 삭제 → trash 이동
  const treeT = await svc.trashEntry('world/마법체계')
  const worldT = treeT.find((n) => n.path === 'world')
  assert(!worldT?.children?.some((c) => c.name === '마법체계'), '카테고리 삭제 실패')
  await fs.access(join(root, 'trash', '마법체계'))
  ok('trashEntry: 카테고리 삭제 → trash 이동')

  // 12) 기본 섹션은 보호
  await assert.rejects(() => svc.trashEntry('world'))
  await assert.rejects(() => svc.renameEntry('manuscript', '뭐'))
  ok('섹션 보호: 기본 섹션 삭제·이름변경 거부')

  // 13) 레거시 임베드 변환 — ![[루트경로]] → 표준 ![](문서기준 상대경로) + 스냅샷 백업
  await svc.saveDoc({
    path: seedPath, // manuscript/01-첫-장.md
    frontmatter: { type: 'chapter', title: '폭우' },
    body: '비 온다.\n![[assets/images/face.png]]\n끝.'
  })
  const conv = await svc.convertLegacyEmbeds()
  assert.equal(conv.files, 1, `변환 파일 수 예상 1, 실제 ${conv.files}`)
  assert.equal(conv.embeds, 1, `변환 임베드 수 예상 1, 실제 ${conv.embeds}`)
  const converted = await svc.readDoc(seedPath)
  assert(
    converted.body.includes('![](../assets/images/face.png)'),
    `표준 임베드 미변환:\n${converted.body}`
  )
  assert(!converted.body.includes('![['), '레거시 위키링크 잔존')
  // 스냅샷 백업이 원본을 보존했는지
  const snaps = await fs.readdir(join(root, 'snapshots'))
  const migDir = snaps.find((d) => d.startsWith('embed-migration-'))
  assert(migDir, '마이그레이션 스냅샷 폴더 없음')
  const backup = await fs.readFile(join(root, 'snapshots', migDir!, seedPath), 'utf8')
  assert(backup.includes('![[assets/images/face.png]]'), '스냅샷에 원본 미보존')
  ok('convertLegacyEmbeds: ![[..]] → 표준 마크다운 + 원본 스냅샷 백업')

  // 14) 첨부 조사·해석 — 이미지(§7.5)
  await fs.mkdir(join(root, 'assets', 'images'), { recursive: true })
  await fs.writeFile(join(root, 'assets', 'images', 'att.png'), PNG_1x1)
  const imgInfo = await svc.attachmentInfo('assets/images/att.png')
  assert.equal(imgInfo.kind, 'image')
  assert.equal(imgInfo.ok, true)
  assert.equal(imgInfo.mediaType, 'image/png')
  const imgRes = await svc.resolveAttachment('assets/images/att.png')
  assert.equal(imgRes.mediaType, 'image/png')
  assert.equal(imgRes.dataBase64, PNG_1x1.toString('base64'), '이미지 base64 불일치')
  ok('attachment: 이미지 조사(mediaType) + base64 해석')

  // 15) 첨부 — 텍스트(.txt)
  await fs.mkdir(join(root, 'assets', 'refs'), { recursive: true })
  await fs.writeFile(join(root, 'assets', 'refs', 'note.txt'), '연구 노트 핵심 내용')
  const txtInfo = await svc.attachmentInfo('assets/refs/note.txt')
  assert.equal(txtInfo.kind, 'text')
  assert.equal(txtInfo.ok, true)
  assert(txtInfo.chars! > 0)
  const txtRes = await svc.resolveAttachment('assets/refs/note.txt')
  assert.equal(txtRes.text, '연구 노트 핵심 내용')
  // 텍스트 문서도 자료 갤러리(listAssets)에 '문서'로 노출돼 픽커에서 첨부 가능해야 한다.
  const assetList = await svc.listAssets()
  const txtAsset = assetList.find((a) => a.path === 'assets/refs/note.txt')
  assert(txtAsset && txtAsset.kind === 'other', '텍스트 문서가 자료 목록에 없음(첨부 불가)')
  ok('attachment: 텍스트(.txt) 조사·해석 + 자료 갤러리 노출')

  // 16) 첨부 — 실제 PDF 텍스트 추출(unpdf)
  await fs.writeFile(join(root, 'assets', 'refs', 'doc.pdf'), minimalPdf('ATTACH_PDF_OK'))
  const pdfInfo = await svc.attachmentInfo('assets/refs/doc.pdf')
  assert.equal(pdfInfo.kind, 'text')
  assert.equal(pdfInfo.ok, true, `PDF 텍스트 추출 실패: ${pdfInfo.note}`)
  const pdfRes = await svc.resolveAttachment('assets/refs/doc.pdf')
  assert(pdfRes.text?.includes('ATTACH_PDF_OK'), `PDF 추출 텍스트에 마커 없음: ${pdfRes.text}`)
  ok('attachment: 실제 PDF 텍스트 추출(unpdf)')

  // 17) 첨부 — 손상/스캔본 PDF는 ok=false로 안내(폴백)
  await fs.writeFile(join(root, 'assets', 'refs', 'scan.pdf'), Buffer.from('not a real pdf'))
  const badInfo = await svc.attachmentInfo('assets/refs/scan.pdf')
  assert.equal(badInfo.ok, false)
  assert(/스캔본|찾지 못함/.test(badInfo.note), `폴백 안내 부적절: ${badInfo.note}`)
  ok('attachment: 손상/스캔본 PDF → ok=false 안내(폴백)')

  // 18) 자료 폴더 자동 읽기 — AI가 스스로 훑어 문서 내용을 맥락에 포함(§7.5).
  //     (지금 assets/에는 note.txt·doc.pdf·scan.pdf·이미지가 있음)
  const ctxAssets = await svc.buildAiContext(seedPath, '비 온다.', true)
  assert(ctxAssets.text.includes('자료 폴더'), '자료 폴더 섹션 없음')
  assert(ctxAssets.text.includes('연구 노트 핵심 내용'), 'txt 문서 자동 읽기 실패')
  assert(ctxAssets.text.includes('ATTACH_PDF_OK'), 'PDF 문서 자동 읽기 실패')
  assert(ctxAssets.chips.some((c) => c.kind === 'asset'), '자료 칩 없음')
  // 끄면 자료 폴더 내용이 빠진다.
  const ctxNoAssets = await svc.buildAiContext(seedPath, '비 온다.', false)
  assert(!ctxNoAssets.text.includes('연구 노트 핵심 내용'), '자료 끔인데도 내용 포함됨')
  assert(!ctxNoAssets.chips.some((c) => c.kind === 'asset'), '자료 끔인데도 자료 칩 있음')
  ok('buildAiContext: 자료 폴더 자동 읽기(문서 내용 포함) + 토글로 제외')

  await fs.rm(root, { recursive: true, force: true })
  console.log(`\n✅ ProjectService: ${pass}개 검증 통과`)
}

async function libraryTests(): Promise<void> {
  // env 오버라이드로 electron 없이 LibraryService 검증(ICEFICTION_DOCS/CONFIG).
  const home = await fs.mkdtemp(join(tmpdir(), 'icefic-lib-'))
  process.env.ICEFICTION_DOCS = home
  process.env.ICEFICTION_CONFIG = join(home, 'config.json')
  const { LibraryService } = await import('../src/main/services/library')
  const lib = new LibraryService()

  // 1) 기본 서재 = <docs>/ICEFiction, 처음엔 비어 있음
  let info = await lib.info()
  assert.equal(info.dir, join(home, 'ICEFiction'))
  assert.equal(info.books.length, 0)
  ok('library: 기본 서재 경로 + 빈 목록')

  // 2) 새 책 생성 → 서재 안에 폴더 + 책장에 노출
  await lib.createBook('은하의 끝')
  info = await lib.info()
  assert.equal(info.books.length, 1)
  assert.equal(info.books[0].title, '은하의 끝')
  assert.equal(info.books[0].chapterCount, 1) // 씨앗 챕터
  await fs.access(join(home, 'ICEFiction', '은하의 끝', 'icefiction.json'))
  ok('library: 새 책 = 서재 안 폴더 자동 생성 + 책장 반영')

  // 3) 두 번째 책 생성 후 목록 2권
  await lib.createBook('빙하기')
  info = await lib.info()
  assert.equal(info.books.length, 2)
  ok('library: 여러 권 관리')

  // 4) 이름 변경
  const target = info.books.find((b) => b.title === '빙하기')!
  info = await lib.renameBook(target.id, '빙하기 연대기')
  assert(info.books.some((b) => b.title === '빙하기 연대기'))
  ok('library: 책 이름 변경')

  // 5) 삭제 → 서재 .trash로 이동(목록에서 사라짐)
  const del = info.books.find((b) => b.title === '빙하기 연대기')!
  info = await lib.deleteBook(del.id)
  assert.equal(info.books.length, 1)
  ok('library: 삭제 = .trash 이동')

  // 6) 서재 경로 변경 → 새 위치 반영
  const other = join(home, '다른서재')
  await lib.setLibraryDir(other)
  info = await lib.info()
  assert.equal(info.dir, other)
  assert.equal(info.books.length, 0) // 새 서재는 비어 있음
  ok('library: 서재 경로 변경')

  // 7) 수동 정렬(order) — reorderBooks가 매니페스트 order를 매기고 재스캔에도 순서 유지
  await lib.createBook('가')
  await lib.createBook('나')
  await lib.createBook('다')
  info = await lib.info()
  assert.equal(info.books.length, 3)
  const rev = [...info.books.map((b) => b.id)].reverse()
  info = await lib.reorderBooks(rev)
  assert.deepEqual(info.books.map((b) => b.id), rev, 'reorder 순서 미반영')
  const rescanned = await lib.info()
  assert.deepEqual(rescanned.books.map((b) => b.id), rev, 'order 영속성 실패(재스캔)')
  ok('library: 드래그 재정렬(order) 영속')

  // 8) 표지 지정 → cover URL 노출 + coverAbsPath 해석 + 실제 파일 존재
  const coverSrc = join(home, 'sample-cover.png')
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
  await fs.writeFile(coverSrc, PNG)
  const firstId = rev[0]
  info = await lib.setBookCover(firstId, coverSrc)
  const covered = info.books.find((b) => b.id === firstId)!
  assert(
    !!covered.cover && covered.cover.startsWith('ice-cover://book/'),
    `표지 URL 미노출: ${covered.cover}`
  )
  const abs = await lib.coverAbsPath(firstId)
  assert(!!abs && abs.toLowerCase().endsWith('.png'), `coverAbsPath 실패: ${abs}`)
  await fs.access(abs!)
  ok('library: 표지 지정 → URL·경로·파일 반영')

  // 9) 표지 제거 → cover 사라짐 + 파일 삭제
  info = await lib.removeBookCover(firstId)
  assert.equal(info.books.find((b) => b.id === firstId)!.cover, undefined, '표지 제거 후에도 노출')
  assert.equal(await lib.coverAbsPath(firstId), null, '표지 파일이 남아있음')
  ok('library: 표지 제거 → cover 해제·파일 삭제')

  await fs.rm(home, { recursive: true, force: true })
  console.log(`✅ LibraryService: 9개 검증 통과`)
}

main()
  .then(libraryTests)
  .catch((err) => {
    console.error('❌ 실패:', err)
    process.exit(1)
  })
