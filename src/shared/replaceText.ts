/**
 * 낱말 바꾸기 — 책 전체 바꾸기(BLUEPRINT §6.9)의 순수 판정.
 *
 * "임시이름"으로 써 두고 나중에 진짜 이름으로 바꾸는 일은 소설 집필에서 가장 흔한 대량 수정이다.
 * 그런데 그 수정이 **찾기와 다른 규칙으로 동작하면** 신뢰가 무너진다 — 찾을 땐 3건이라더니
 * 2건만 바뀌는 식이다. 그래서 찾기와 바꾸기가 **같은 정규식**을 쓰도록 여기 한곳에 모은다.
 *
 * 이 파일은 순수 함수만 담는다(§11). 파일 입출력·백업은 main/services/project.ts.
 */

/** 정규식 특수문자를 글자 그대로 찾도록 이스케이프. */
export function escapeForRegex(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 찾기·바꾸기가 함께 쓰는 정규식(전역). 대소문자 구분은 선택. */
export function searchRegex(query: string, caseSensitive = false): RegExp {
  return new RegExp(escapeForRegex(query), caseSensitive ? 'g' : 'gi')
}

/**
 * 글 안의 모든 일치를 바꾼다.
 *
 * ⚠️ 바꿀 말은 **글자 그대로** 넣는다. `String.replace`의 두 번째 인수를 문자열로 주면 `$&`·`$1`이
 * 치환 패턴으로 해석돼, 이름에 `$`가 들어간 순간 엉뚱한 글이 박힌다. 그래서 함수형 치환을 쓴다.
 *
 * @returns 바뀐 글과 **바꾼 횟수**(0이면 파일을 건드리지 않는다는 신호로 쓴다)
 */
export function replaceInText(
  text: string,
  query: string,
  replacement: string,
  caseSensitive = false
): { text: string; count: number } {
  if (!query) return { text, count: 0 }
  let count = 0
  const out = text.replace(searchRegex(query, caseSensitive), () => {
    count += 1
    return replacement
  })
  return { text: out, count }
}
