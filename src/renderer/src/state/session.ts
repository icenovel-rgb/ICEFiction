/**
 * 집필 세션 기억 — 책마다 "마지막에 어디까지 쓰고 있었나"(BLUEPRINT §6.1).
 *
 * 앱을 다시 켰을 때 책만 고르면 곧바로 쓰던 문서·쓰던 자리로 돌아간다. 책상 위에 펼쳐 둔 원고를
 * 그대로 두고 나갔다가 앉으면 그 페이지가 펼쳐져 있는 것과 같다.
 *
 * 기기별 습관이지 원고의 내용이 아니므로 **localStorage에 둔다**(설정과 같은 자리) — 프로젝트
 * 폴더에 쓰면 클라우드로 여러 대가 공유될 때 서로의 커서를 덮어쓰고, 원고 폴더도 지저분해진다.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 기억해 둘 책 수 상한 — 넘으면 오래된 것부터 버린다(무한정 쌓이지 않게). */
const MAX_BOOKS = 50

export interface BookSpot {
  /** 마지막으로 열려 있던 문서(프로젝트 루트 기준 상대 POSIX). */
  path: string
  /** 커서(선택) 위치 — 본문 기준 오프셋. */
  anchor: number
  head: number
  /** 세로 스크롤 위치(px) — 커서가 화면 어디쯤 있었는지까지 되살린다. */
  scrollTop?: number
  /** 마지막으로 손댄 시각(ms) — 상한을 넘길 때 오래된 것부터 버리는 기준. */
  at: number
}

interface SessionState {
  /** 책 절대경로 → 마지막 자리. 책 id가 아니라 절대경로라 기존 IPC를 건드리지 않는다. */
  spots: Record<string, BookSpot>
  remember: (bookKey: string, spot: Omit<BookSpot, 'at'>) => void
  recall: (bookKey: string) => BookSpot | null
  forget: (bookKey: string) => void
}

/** 상한을 넘으면 최근 것만 남긴다. */
function prune(spots: Record<string, BookSpot>): Record<string, BookSpot> {
  const keys = Object.keys(spots)
  if (keys.length <= MAX_BOOKS) return spots
  const kept = keys
    .sort((a, b) => (spots[b]?.at ?? 0) - (spots[a]?.at ?? 0))
    .slice(0, MAX_BOOKS)
  return Object.fromEntries(kept.map((k) => [k, spots[k]]))
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      spots: {},

      remember(bookKey, spot) {
        if (!bookKey || !spot.path) return
        set((s) => ({
          spots: prune({ ...s.spots, [bookKey]: { ...spot, at: Date.now() } })
        }))
      },

      recall(bookKey) {
        return (bookKey && get().spots[bookKey]) || null
      },

      forget(bookKey) {
        set((s) => {
          const { [bookKey]: _drop, ...rest } = s.spots
          return { spots: rest }
        })
      }
    }),
    { name: 'icefiction-session' }
  )
)
