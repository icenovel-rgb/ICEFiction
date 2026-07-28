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

function mb(bytes?: number): string {
  return bytes ? `${Math.round(bytes / 1048576)}MB` : ''
}

export function UpdateBar(): React.ReactElement | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    // 시작하자마자 한 번만. 실패하면 checked:false로 돌아오므로 아무것도 뜨지 않는다.
    void (async () => {
      try {
        const res = await window.api.checkUpdate()
        if (!res.checked || !res.hasUpdate) return
        if (res.latest && localStorage.getItem(SKIP_KEY) === res.latest) return
        setInfo(res)
      } catch {
        /* 확인 실패는 조용히 — 집필을 방해하지 않는다 */
      }
    })()
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
