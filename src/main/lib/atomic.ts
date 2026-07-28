/**
 * 원자적 파일 쓰기 — temp 파일에 쓴 뒤 rename으로 교체(BLUEPRINT §4).
 *
 * 왜? 클라우드 동기화 폴더(MYBOX·Dropbox)에서 쓰기 도중 동기화가 끼어들면 원고가 반쯤 쓰인
 * 상태로 업로드돼 유실될 수 있다. rename은 대부분 파일시스템에서 원자적이라 "완성본 or 이전본"만
 * 남고 반쪽 파일이 남지 않는다.
 */
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { promises as fs } from 'node:fs'

/** 텍스트(.md·JSON)와 바이너리(PNG 표지) 모두 받는다 — 인코딩은 문자열일 때만 지정한다. */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  const dir = dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = join(dir, `.tmp-${randomBytes(6).toString('hex')}`)
  try {
    if (typeof data === 'string') await fs.writeFile(tmp, data, 'utf8')
    else await fs.writeFile(tmp, data)
    await fs.rename(tmp, filePath)
  } catch (err) {
    // 실패 시 temp 잔여물 정리(성공하면 rename으로 사라짐).
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
