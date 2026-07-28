/**
 * 버전 비교 — "0.10.0"이 "0.9.0"보다 **높다**(BLUEPRINT §9.1).
 *
 * 문자열로 비교하면 "0.10.0" < "0.9.0"이 된다(1 < 9). 배포 알림에서 이걸 틀리면
 * 새 버전이 나왔는데 조용하거나, 옛 버전을 새 것이라고 알린다. 그래서 마디별 숫자로 비교한다.
 *
 * 순수 함수 — 그대로 단위 테스트한다.
 */

/** a > b면 양수, 같으면 0, a < b면 음수. 접두사 v와 -beta 같은 꼬리표는 무시한다. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/** "v0.10.0-beta.1" → [0, 10, 0]. 숫자가 아니면 0으로 본다(견고성). */
function parseVersion(v: string): [number, number, number] {
  const core = (v ?? '').trim().replace(/^v/i, '').split(/[-+]/)[0]
  const parts = core.split('.').map((n) => {
    const x = Number.parseInt(n, 10)
    return Number.isFinite(x) ? x : 0
  })
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}
