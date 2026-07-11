/**
 * 모달 호스트 — openPrompt/openConfirm 요청을 실제 창으로 그린다(ICEPDF 모달 스타일).
 * Enter=확인, Esc=취소. 열릴 때 입력에 자동 포커스+전체 선택.
 */
import { useEffect, useRef, useState } from 'react'
import type { ConfirmEntry, PromptEntry } from '../ui/dialogs'
import { useDialogs } from '../ui/dialogs'

export function DialogHost(): React.ReactElement | null {
  const current = useDialogs((s) => s.current)
  if (!current) return null
  // key로 요청이 바뀔 때마다 내부 상태(입력값)를 초기화.
  return current.kind === 'prompt' ? (
    <PromptModal key={current.id} entry={current} />
  ) : (
    <ConfirmModal key={current.id} entry={current} />
  )
}

function Backdrop({
  children,
  onCancel
}: {
  children: React.ReactNode
  onCancel: () => void
}): React.ReactElement {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}

function PromptModal({ entry }: { entry: PromptEntry }): React.ReactElement {
  const submit = useDialogs((s) => s.submit)
  const [value, setValue] = useState(entry.defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = (): void => {
    const v = value.trim()
    submit(v ? v : null)
  }

  return (
    <Backdrop onCancel={() => submit(null)}>
      <div className="dialog-title">{entry.title}</div>
      <input
        ref={inputRef}
        className="dialog-input"
        value={value}
        placeholder={entry.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm()
          else if (e.key === 'Escape') submit(null)
        }}
      />
      <div className="dialog-actions">
        <button className="dialog-cancel" onClick={() => submit(null)}>
          취소
        </button>
        <button
          className={`dialog-confirm${entry.danger ? ' danger' : ''}`}
          onClick={confirm}
        >
          {entry.confirmLabel ?? '확인'}
        </button>
      </div>
    </Backdrop>
  )
}

function ConfirmModal({ entry }: { entry: ConfirmEntry }): React.ReactElement {
  const submit = useDialogs((s) => s.submit)
  return (
    <Backdrop onCancel={() => submit(false)}>
      <div className="dialog-title">{entry.title}</div>
      {entry.message && <div className="dialog-message">{entry.message}</div>}
      <div className="dialog-actions">
        <button className="dialog-cancel" onClick={() => submit(false)}>
          취소
        </button>
        <button
          className={`dialog-confirm${entry.danger ? ' danger' : ''}`}
          onClick={() => submit(true)}
          autoFocus
        >
          {entry.confirmLabel ?? '확인'}
        </button>
      </div>
    </Backdrop>
  )
}
