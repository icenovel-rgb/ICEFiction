/**
 * 업데이트 알림 막대(BLUEPRINT §9.1) — 새 버전이 나오면 앱이 먼저 알려 준다.
 *
 * 집필을 막지 않는 것이 원칙이다. 모달로 가로막지 않고 아래쪽에 막대로 뜨며, 닫으면
 * **그 버전은 다시 말하지 않는다**(더 새 버전이 나오면 그때 다시 뜬다).
 * 내려받기는 앱이 직접 설치하지 않고 기본 브라우저로 넘긴다 — 무엇을 받는지 눈으로 보게 한다.
 */
import { useEffect, useState } from 'react'
import type { UpdateInfo } from '../../../shared/types'

/** 사용자가 "나중에"로 넘긴 버전 — 기기별 취향이라 localStorage에 둔다. */
const SKIP_KEY = 'icefiction-update-skip'
/**
 * 다시 물어보는 간격.
 *
 * ★ 시작할 때 한 번만 물으면 며칠 켜 두는 사람에게는 영영 안 뜬다(맥은 창을 닫아도 앱이
 * 살아 있다 — 2026-08-01 실측). GitHub를 실제로 두드리는 횟수는 메인 쪽 캐시(6시간)가
 * 눌러 주므로, 여기서는 자주 물어도 대개 캐시된 답이 돌아온다.
 */
const RECHECK_MS = 60 * 60 * 1000

function mb(bytes?: number): string {
  return bytes ? `${Math.round(bytes / 1048576)}MB` : ''
}

export function UpdateBar(): React.ReactElement | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    let alive = true

    // 실패하면 checked:false로 돌아오므로 아무것도 뜨지 않는다.
    const ask = async (): Promise<void> => {
      try {
        const res = await window.api.checkUpdate()
        if (!alive || !res.checked || !res.hasUpdate) return
        if (res.latest && localStorage.getItem(SKIP_KEY) === res.latest) return
        setInfo(res)
      } catch {
        /* 확인 실패는 조용히 — 집필을 방해하지 않는다 */
      }
    }

    void ask()
    // 시작 때 한 번으로 끝내지 않는다(§RECHECK_MS). 켜 둔 채 며칠이 지나도,
    // 다른 일 하다 창으로 돌아와도 그때 다시 물어본다.
    const timer = setInterval(() => void ask(), RECHECK_MS)
    const onFocus = (): void => void ask()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!info?.hasUpdate) return null

  const dismiss = (): void => {
    if (info.latest) localStorage.setItem(SKIP_KEY, info.latest)
    setInfo(null)
  }

  return (
    <div className="update-bar" role="status">
      <span className="update-bar-what">
        <b>새 버전 v{info.latest}</b>
        <span className="update-bar-cur"> (지금 v{info.current})</span>
        {info.date && <span className="update-bar-cur"> · {info.date}</span>}
      </span>
      {info.notes && <span className="update-bar-notes">{info.notes}</span>}
      <button
        className="update-btn accept"
        onClick={() => void window.api.openExternal(info.url ?? info.pageUrl)}
      >
        내려받기 {mb(info.sizeBytes)}
      </button>
      <button className="update-btn" onClick={dismiss} title="이 버전은 다시 알리지 않습니다">
        나중에
      </button>
    </div>
  )
}
