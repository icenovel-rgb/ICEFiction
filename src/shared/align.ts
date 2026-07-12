/**
 * 문단 정렬 — 선택한 부분만 정렬한다(BLUEPRINT §6.1).
 *
 * 마크다운엔 정렬 문법이 없다. 그래서 **표준 HTML 블록**으로 감싼다:
 *
 *   <div align="center">
 *
 *   본문...
 *
 *   </div>
 *
 * 이 형태는 깃허브·옵시디언·VS Code 미리보기에서도 그대로 정렬돼 보인다(이식성 §6.11).
 * 여는 태그 뒤 빈 줄이 있어야 안쪽 내용이 "HTML 덩어리"가 아니라 마크다운으로 파싱된다(CommonMark).
 *
 * 이 파일은 **순수 함수만** 담는다 — CodeMirror에 의존하지 않아 그대로 단위 테스트한다.
 */

export type BlockAlign = 'left' | 'center' | 'right' | 'justify'

/** 여는 태그 줄: <div align="center">  (앞뒤 공백 허용) */
export const ALIGN_OPEN_RE = /^<div\s+align="(left|center|right|justify)"\s*>$/i
/** 닫는 태그 줄: </div> */
export const ALIGN_CLOSE_RE = /^<\/div>$/i

export interface AlignBlock {
  open: number // 여는 태그 줄 번호(0-based)
  close: number // 닫는 태그 줄 번호(0-based)
  align: BlockAlign
}

function isBlank(line: string | undefined): boolean {
  return line !== undefined && line.trim() === ''
}

/**
 * [startLine, endLine](0-based, inclusive)을 감싸고 있는 정렬 블록을 찾는다. 없으면 null.
 * 위로 올라가다 닫는 태그를 먼저 만나면 "블록 밖"이므로 null.
 */
export function findAlignBlock(
  lines: string[],
  startLine: number,
  endLine: number
): AlignBlock | null {
  let open = -1
  let align: BlockAlign | null = null
  for (let i = startLine; i >= 0; i -= 1) {
    const t = (lines[i] ?? '').trim()
    if (i < startLine && ALIGN_CLOSE_RE.test(t)) return null // 우리 위에서 이미 닫힘 → 밖
    const m = t.match(ALIGN_OPEN_RE)
    if (m) {
      open = i
      align = m[1].toLowerCase() as BlockAlign
      break
    }
  }
  if (open < 0 || !align) return null

  let close = -1
  for (let i = Math.max(endLine, open + 1); i < lines.length; i += 1) {
    const t = (lines[i] ?? '').trim()
    if (i > endLine && ALIGN_OPEN_RE.test(t)) return null // 닫히기 전에 새 블록 시작 → 짝이 아님
    if (ALIGN_CLOSE_RE.test(t)) {
      close = i
      break
    }
  }
  if (close < 0) return null
  return { open, close, align }
}

/**
 * 선택(또는 커서)을 **문단 단위**로 넓힌다 — 정렬은 문단이 최소 단위이기 때문.
 *  · 문단 = 빈 줄로 둘러싸인 연속된 글줄
 *  · 커서/선택이 빈 줄에만 있으면 가장 가까운 문단(위 우선, 없으면 아래)으로 옮긴다
 *  · 문단 일부만 드래그해도 그 문단 전체를 감싼다(문단 중간에서 정렬이 끊기면 안 되므로)
 * 감쌀 본문이 아예 없으면(빈 문서) null.
 */
function paragraphRange(
  lines: string[],
  startLine: number,
  endLine: number
): { s: number; e: number } | null {
  let s = Math.max(0, Math.min(startLine, lines.length - 1))
  let e = Math.max(0, Math.min(endLine, lines.length - 1))

  // 선택 구간이 전부 빈 줄이면 가장 가까운 글줄로 이동
  let hasText = false
  for (let i = s; i <= e; i += 1) if (!isBlank(lines[i])) hasText = true
  if (!hasText) {
    let k = s
    while (k >= 0 && isBlank(lines[k])) k -= 1 // 위로
    if (k < 0) {
      k = e
      while (k < lines.length && isBlank(lines[k])) k += 1 // 아래로
    }
    if (k < 0 || k >= lines.length) return null // 글줄이 하나도 없음
    s = k
    e = k
  }

  // 양 끝을 문단 경계까지 넓힌다(빈 줄을 만날 때까지)
  while (s > 0 && !isBlank(lines[s - 1])) s -= 1
  while (e < lines.length - 1 && !isBlank(lines[e + 1])) e += 1
  // 앞뒤에 남은 빈 줄은 블록 밖으로
  while (s <= e && isBlank(lines[s])) s += 1
  while (e >= s && isBlank(lines[e])) e -= 1
  if (s > e) return null
  return { s, e }
}

/**
 * 선택한 줄 범위에 정렬을 적용/변경/해제한다.
 *  · 이미 정렬 블록 안이면 → 태그만 교체(align) 또는 태그 제거(align=null)
 *  · 아니면 → 선택 줄들을 <div align="…"> … </div> 로 감싼다
 *
 * 반환 selection(startLine/endLine)은 **내용 줄** 기준으로 다시 계산해 돌려준다(커서 복원용).
 */
export function setAlign(
  lines: string[],
  startLine: number,
  endLine: number,
  align: BlockAlign | null
): { lines: string[]; startLine: number; endLine: number } {
  const block = findAlignBlock(lines, startLine, endLine)

  // ── 이미 정렬 블록 안 ──
  if (block) {
    if (align) {
      const next = [...lines]
      next[block.open] = `<div align="${align}">`
      return { lines: next, startLine, endLine }
    }
    // 해제 — 여는/닫는 태그와, 우리가 넣었던 인접 빈 줄을 함께 걷어낸다.
    const drop = new Set<number>([block.open, block.close])
    if (isBlank(lines[block.open + 1])) drop.add(block.open + 1)
    if (isBlank(lines[block.close - 1])) drop.add(block.close - 1)
    const next = lines.filter((_, i) => !drop.has(i))
    const removedBefore = [...drop].filter((i) => i < startLine).length
    return {
      lines: next,
      startLine: Math.max(0, startLine - removedBefore),
      endLine: Math.max(0, endLine - removedBefore)
    }
  }

  // ── 해제인데 감싼 블록이 없으면 할 일 없음 ──
  if (!align) return { lines, startLine, endLine }

  const range = paragraphRange(lines, startLine, endLine)
  if (!range) return { lines, startLine, endLine } // 감쌀 본문이 없다(빈 문서 등)
  const { s, e } = range

  const before = lines.slice(0, s)
  const body = lines.slice(s, e + 1)
  const after = lines.slice(e + 1)

  const head: string[] = []
  if (before.length > 0 && !isBlank(before[before.length - 1])) head.push('') // 앞 문단과 분리
  head.push(`<div align="${align}">`, '')

  const tail: string[] = ['', '</div>']
  if (after.length > 0 && !isBlank(after[0])) tail.push('') // 뒤 문단과 분리

  const next = [...before, ...head, ...body, ...tail, ...after]
  const contentStart = before.length + head.length
  return {
    lines: next,
    startLine: contentStart,
    endLine: contentStart + body.length - 1
  }
}

/**
 * 문서 전체를 훑어 정렬 블록 목록을 뽑는다(에디터 라이브 프리뷰용).
 * 짝이 맞지 않는 태그는 무시한다.
 */
export function scanAlignBlocks(lines: string[]): AlignBlock[] {
  const out: AlignBlock[] = []
  let i = 0
  while (i < lines.length) {
    const m = (lines[i] ?? '').trim().match(ALIGN_OPEN_RE)
    if (!m) {
      i += 1
      continue
    }
    let j = i + 1
    while (j < lines.length && !ALIGN_CLOSE_RE.test((lines[j] ?? '').trim())) j += 1
    if (j >= lines.length) break // 닫히지 않음 → 무시
    out.push({ open: i, close: j, align: m[1].toLowerCase() as BlockAlign })
    i = j + 1
  }
  return out
}
