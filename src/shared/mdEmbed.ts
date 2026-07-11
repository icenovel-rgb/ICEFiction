/**
 * 이미지 임베드 경로 유틸(BLUEPRINT §6.10) — 순수 함수. node/electron에 의존하지 않아
 * main(Node)·renderer(브라우저)·테스트(tsx) 어디서나 그대로 쓴다.
 *
 * 왜 필요한가: 앱 내부 트리는 "루트 기준 상대경로"(assets/images/x.png)를 쓴다. 그러나 표준
 * 마크다운 이미지 `![](경로)`가 다른 프로그램(VS Code·GitHub·Typora·옵시디언 등)에서도 열리려면
 * 경로가 **그 .md 문서 기준 상대경로**여야 한다(manuscript/장1.md 에서 보면 ../assets/images/x.png).
 * 그래서 삽입할 땐 문서 기준으로 바꾸고(toStandardEmbed), 화면에 렌더할 땐 다시 루트 기준으로
 * 되돌린다(embedToRootRel). 레거시 위키링크 `![[루트경로]]`도 계속 읽는다(하위호환).
 */

/** POSIX 세그먼트 정규화 — ''·'.' 제거, '..' 축약. */
function normSegs(segs: string[]): string[] {
  const out: string[] = []
  for (const s of segs) {
    if (s === '' || s === '.') continue
    if (s === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else out.push('..')
    } else out.push(s)
  }
  return out
}

/** 'a/b/c.md' → 'a/b' (구분자 없으면 ''). 입력은 POSIX(`/`)로 가정. */
export function posixDir(p: string): string {
  const norm = p.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i < 0 ? '' : norm.slice(0, i)
}

/** fromDir → to 의 상대경로(POSIX). 예: relPosix('manuscript','assets/x.png') = '../assets/x.png'. */
export function relPosix(fromDir: string, to: string): string {
  const f = normSegs(fromDir.replace(/\\/g, '/').split('/'))
  const t = normSegs(to.replace(/\\/g, '/').split('/'))
  let i = 0
  while (i < f.length && i < t.length && f[i] === t[i]) i += 1
  const up = f.slice(i).map(() => '..')
  const down = t.slice(i)
  const rel = [...up, ...down].join('/')
  return rel || '.'
}

/** fromDir 기준 상대경로를 루트 기준으로 합친다. 예: resolvePosix('manuscript','../assets/x.png') = 'assets/x.png'. */
export function resolvePosix(fromDir: string, rel: string): string {
  const base = fromDir.replace(/\\/g, '/').split('/')
  const add = rel.replace(/\\/g, '/').split('/')
  return normSegs([...base, ...add]).join('/')
}

/**
 * 마크다운 링크 URL에서 파싱을 깨는 문자만 최소 인코딩한다.
 * 공백·괄호·`#`은 `![](...)` 문법이나 URL 프래그먼트를 깨므로 %-인코딩하고, 슬래시·한글 등은
 * 가독성을 위해 그대로 둔다(대부분의 렌더러가 비ASCII 경로를 잘 처리한다).
 */
export function encodeEmbedUrl(path: string): string {
  return path.replace(/[ ()#]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

/** 안전 디코드(%20 등). 실패하면 원문 유지. */
export function decodeEmbedUrl(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

/**
 * 루트 기준 자료경로 → 문서에 삽입할 **표준** 임베드 마크다운.
 * docRootRel(현재 .md의 루트 기준 경로)이 있으면 문서 기준 상대경로로, 없으면 루트 경로 그대로(폴백).
 */
export function toStandardEmbed(assetRootRel: string, docRootRel: string | null): string {
  const clean = assetRootRel.replace(/\\/g, '/').replace(/^\/+/, '')
  const rel = docRootRel ? relPosix(posixDir(docRootRel), clean) : clean
  return `![](${encodeEmbedUrl(rel)})`
}

/**
 * 임베드 안의 경로를 루트 기준 상대경로로 정규화(렌더·라이트박스용).
 *  · 위키링크 `![[..]]`(isWikilink=true): 내용이 루트 기준(레거시 내부 포맷).
 *  · 표준 `![](..)`: 문서 기준 상대경로 → docRootRel로 되돌린다.
 */
export function embedToRootRel(
  rawPath: string,
  isWikilink: boolean,
  docRootRel: string | null
): string {
  const p = decodeEmbedUrl(rawPath.trim()).replace(/\\/g, '/')
  if (isWikilink || !docRootRel) return p.replace(/^\/+/, '')
  if (/^[a-z]+:/i.test(p)) return p // 이미 URL이면 그대로(호출부에서 걸러지지만 방어)
  return resolvePosix(posixDir(docRootRel), p)
}

/** 위키링크(![[..]])와 표준(![](..)) 임베드를 모두 잡는 전역 정규식. group1=위키링크 내용, group2=표준 URL. */
export const EMBED_RE = /!\[\[([^\]]+?)\]\]|!\[[^\]]*\]\(([^)]+?)\)/g
