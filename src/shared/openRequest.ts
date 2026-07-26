/**
 * 열람 프로토콜 파서(BLUEPRINT §7.5) — AI 응답에서 `[[열람: 경로]]` 요청을 뽑아낸다.
 *
 * 왜 이런 방식인가: 앱은 소설 폴더 전체를 매 요청에 실을 수 없다(장편이면 수십만 자). 대신 **목차**를
 * 주고, 필요한 파일만 AI가 지목하게 한다. 도서관에서 서가 목록을 보고 청구기호로 책을 부르는 것과 같다.
 * 사서(앱)만 서가에 들어가므로, 경로 검증은 main의 readForAi가 맡는다.
 *
 * 이 파일은 순수 함수만 담는다 — 그대로 단위 테스트한다. main(읽는 쪽)과 렌더러(요청을 뽑는 쪽)가
 * 같은 상한을 봐야 하므로 shared에 둔다.
 */

/** 한 번에 열어 줄 수 있는 최대 파일 수 — main의 readForAi도 이 값을 쓴다. */
export const OPEN_MAX_FILES = 5

/** `[[열람: 경로]]` — 콜론 뒤 공백은 자유, 전각 콜론(：)도 받는다(한글 IME에서 흔하다). */
const OPEN_RE = /\[\[\s*열람\s*[:：]\s*([^\]\n]+?)\s*\]\]/g

/**
 * 응답에서 열람 요청 경로를 뽑는다. 중복은 제거하고 최대 5개까지.
 * 경로는 프로젝트 루트 기준 상대경로로 정규화한다(역슬래시·선행 슬래시·따옴표 제거).
 */
export function parseOpenRequests(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(OPEN_RE)) {
    const path = m[1]
      .trim()
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
    if (!path || path.includes('\n')) continue
    if (!out.includes(path)) out.push(path)
    if (out.length >= OPEN_MAX_FILES) break
  }
  return out
}

/** 화면에 보여 줄 때는 요청 표시를 걷어낸다 — 사용자에게는 기계 문법이 아니라 답이 보여야 한다. */
export function stripOpenRequests(text: string): string {
  return text.replace(OPEN_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** 응답이 "열람 요청만" 한 것인가(그렇다면 사용자에게 보여 줄 답이 아직 없다). */
export function isOnlyOpenRequest(text: string): boolean {
  return parseOpenRequests(text).length > 0 && stripOpenRequests(text).length < 40
}
