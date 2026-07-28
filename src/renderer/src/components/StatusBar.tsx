/**
 * 상태바 — 글자수(공백 포함/제외)·원고지 매수·세션 증감·저장 상태(BLUEPRINT §6.1, §8).
 */
import { useMemo } from 'react'
import { countText } from '../lib/wordcount'
import { useStore } from '../state/store'

export function StatusBar(): React.ReactElement {
  const body = useStore((s) => s.body)
  const activePath = useStore((s) => s.activePath)
  const dirty = useStore((s) => s.dirty)
  const saving = useStore((s) => s.saving)
  const sessionStartChars = useStore((s) => s.sessionStartChars)

  const counts = useMemo(() => countText(body), [body])
  const sessionDelta = counts.withSpaces - sessionStartChars

  const saveLabel = saving ? '저장 중…' : dirty ? '● 미저장' : '저장됨'

  if (!activePath) {
    return (
      <div className="statusbar">
        <span className="sb-muted">문서를 선택하세요</span>
      </div>
    )
  }

  return (
    <div className="statusbar">
      <span className="sb-path">{activePath}</span>
      <div className="sb-right">
        <span>{counts.withoutSpaces.toLocaleString('ko')}자(공백제외)</span>
        <span className="sb-muted">{counts.withSpaces.toLocaleString('ko')}자(공백포함)</span>
        <span className="sb-muted">원고지 {counts.manuscriptPages}매</span>
        <span className={sessionDelta >= 0 ? 'sb-pos' : 'sb-neg'}>
          이번 세션 {sessionDelta >= 0 ? '+' : ''}
          {sessionDelta.toLocaleString('ko')}자
        </span>
        <span className={dirty ? 'sb-dirty' : 'sb-saved'}>{saveLabel}</span>
      </div>
    </div>
  )
}
