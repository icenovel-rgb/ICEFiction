/**
 * AI 에러 분류 — ICEWriter core/ai/base.py 이식(BLUEPRINT §7.1).
 *
 * PAUSE_KINDS(인증 만료·rate limit·quota 소진)면 "멈추고 나중에 이어서" 정책 — 조용히 정지하고
 * 재로그인/충전 안내. CLI·API 출력에서 한/영 이중 정규식으로 종류를 추정한다.
 */
import type { AIErrorKind, AIConnStatus } from '../../shared/types'

export const PAUSE_KINDS: ReadonlySet<AIErrorKind> = new Set([
  'auth_expired',
  'rate_limited',
  'quota_exhausted'
])

export class AIError extends Error {
  constructor(
    public kind: AIErrorKind,
    message: string,
    public raw = ''
  ) {
    super(message)
  }
  get shouldPause(): boolean {
    return PAUSE_KINDS.has(this.kind)
  }
}

const PATTERNS: [AIErrorKind, RegExp][] = [
  [
    'auth_expired',
    /unauthorized|invalid.{0,10}(api.?key|token)|not logged in|login required|authentication|expired.{0,10}(token|session)|\b401\b|재로그인|로그인이 만료/i
  ],
  [
    'quota_exhausted',
    /insufficient.{0,10}(quota|credit)|credit balance|quota exceeded|usage limit|out of credits|billing|한도.{0,6}(소진|초과)/i
  ],
  ['rate_limited', /rate.?limit|too many requests|\b429\b|overloaded|\b529\b/i],
  [
    'not_installed',
    /not (found|recognized)|no such file|command not found|찾을 수 없습니다|인식할 수 없/i
  ],
  ['network', /connection (refused|reset|error)|timed? ?out|dns|network|ssl|ENOTFOUND|ECONNREFUSED/i]
]

export function classifyError(text: string): AIErrorKind {
  for (const [kind, re] of PATTERNS) {
    if (re.test(text || '')) return kind
  }
  return 'other'
}

export function userMessage(name: string, kind: AIErrorKind): string {
  switch (kind) {
    case 'auth_expired':
      return `${name} 로그인/키가 만료됐습니다 — 재설정 후 다시 시도하세요`
    case 'rate_limited':
      return `${name} 사용량 한도에 걸렸습니다 — 잠시 후 다시 시도하세요`
    case 'quota_exhausted':
      return `${name} 크레딧/한도가 소진됐습니다 — 충전 후 다시 시도하세요`
    case 'not_installed':
      return `${name} 을(를) 찾을 수 없습니다 — 설치·설정을 확인하세요`
    case 'network':
      return `${name} 네트워크 오류 — 연결을 확인하세요`
    case 'cancelled':
      return '중지했습니다'
    default:
      return `${name} 실행이 실패했습니다`
  }
}

export function connFromError(err: unknown): AIConnStatus {
  if (err instanceof AIError) {
    const state =
      err.kind === 'auth_expired'
        ? 'auth'
        : err.kind === 'rate_limited' || err.kind === 'quota_exhausted'
          ? 'limit'
          : err.kind === 'not_installed'
            ? 'missing'
            : 'error'
    return { ok: false, state, detail: err.message }
  }
  return { ok: false, state: 'error', detail: err instanceof Error ? err.message : String(err) }
}
