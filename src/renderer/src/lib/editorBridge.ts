/**
 * 에디터 브리지 — AI 패널이 현재 에디터의 선택/본문을 읽고 결과를 삽입할 수 있게 하는 얇은 통로.
 * Editor가 뷰를 등록/해제한다. AI는 원고를 직접 덮어쓰지 않고, 사용자가 명시적으로 삽입한다(§7.4).
 */
import type { EditorView } from '@codemirror/view'

let view: EditorView | null = null

export function setEditorView(v: EditorView | null): void {
  view = v
}

export function getSelectionText(): string {
  if (!view) return ''
  const { from, to } = view.state.selection.main
  return view.state.sliceDoc(from, to)
}

export function getDocText(): string {
  return view ? view.state.doc.toString() : ''
}

/** 선택이 있으면 교체, 없으면 커서 위치에 삽입. 사용자 명시 동작(제안 → 승인). */
export function insertOrReplace(text: string): void {
  if (!view) return
  const { from, to } = view.state.selection.main
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  view.focus()
}
