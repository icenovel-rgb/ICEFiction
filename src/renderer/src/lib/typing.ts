/**
 * 입력 도우미(BLUEPRINT §6.1c) — 따옴표 자동 짝 + 줄 앞 `--` → 불릿.
 *
 * 판단은 전부 순수 함수(shared/quotePair.ts · shared/dash.ts)에 있고, 여기서는 CodeMirror에
 * 배선만 한다. `EditorView.inputHandler`로 **글자가 들어가기 직전에** 가로챈다.
 *
 * ⚠️ 한글 IME와 얽히는 지점(실측 근거로 설계):
 *  ① closeBrackets(@codemirror/autocomplete)는 조합 중이면 아예 손을 떼는데, 그러면
 *     `"안녕|"`에서 마지막 글자가 조합 중일 때 닫는 따옴표가 **건너뛰기되지 않고 하나 더** 들어간다
 *     (`"안녕""`). 그래서 우리는 조합 여부로 포기하지 않는다 — 우리가 다루는 부호(따옴표·낫표·`-`)는
 *     한글 조합에 참여하는 자모가 아니라서, 이 글자가 들어오는 순간 조합은 어차피 끝난다.
 *  ② 조합이 확정되며 `안녕"`처럼 **한 뭉치로** 실려 올 수 있다. 그래서 마지막 글자만 부호로 보고,
 *     앞부분(lead)은 그대로 함께 넣는다.
 */
import { EditorView, type Command } from '@codemirror/view'
import { dashRewrite } from '../../../shared/dash'
import { emptyQuotePair, quoteAction } from '../../../shared/quotePair'
import { useSettings } from '../state/settings'

/** 줄바꿈은 '아무것도 없음'과 같게 본다 — 줄 끝에서도 짝이 생겨야 하므로. */
function edgeChar(raw: string): string {
  return raw === '\n' || raw === '\r' ? '' : raw
}

/**
 * 따옴표 자동 짝 + `--` 불릿. 개입했으면 true(기본 입력을 취소한다).
 *
 * 설정은 **호출 시점에 읽는다** — 보기 옵션을 끄고 켤 때 확장을 재조립하지 않아도 즉시 반영된다.
 */
export const smartTyping = EditorView.inputHandler.of((view, from, to, text) => {
  if (view.state.readOnly || text.length === 0) return false
  const s = useSettings.getState()
  const doc = view.state.doc

  // ── 줄 앞 `--` → 불릿(`• `), 세 번째 `-`면 구분선(`---`) ──
  if (s.dashBullet && text === '-' && from === to) {
    const line = doc.lineAt(from)
    const rw = dashRewrite(doc.sliceString(line.from, from), doc.sliceString(from, line.to), '-')
    if (rw) {
      const start = from - rw.back
      view.dispatch({
        changes: { from: start, to, insert: rw.insert },
        selection: { anchor: start + rw.insert.length },
        userEvent: 'input.type',
        scrollIntoView: true
      })
      return true
    }
  }

  // ── 따옴표 자동 짝 ──
  if (!s.autoPairQuotes) return false

  const typed = text.slice(-1) // 조합 확정분이 함께 실려 올 수 있어 마지막 글자만 본다
  const lead = text.slice(0, -1) // 함께 실려 온 앞부분은 그대로 넣는다
  const before = lead.length > 0 ? lead.slice(-1) : edgeChar(doc.sliceString(Math.max(0, from - 1), from))
  const after = edgeChar(doc.sliceString(to, Math.min(doc.length, to + 1)))
  // 고른 글을 감싸는 건 순수하게 부호 한 글자만 들어올 때다(조합분이 붙어 오면 '덮어쓰기'다).
  const hasSelection = from !== to && lead.length === 0

  const action = quoteAction(typed, before, after, hasSelection)
  if (!action) return false

  if (action.kind === 'wrap') {
    view.dispatch({
      changes: [
        { from, insert: action.open },
        { from: to, insert: action.close }
      ],
      selection: { anchor: from + action.open.length, head: to + action.open.length },
      userEvent: 'input.type',
      scrollIntoView: true
    })
    return true
  }

  if (action.kind === 'skip') {
    // 부호를 넣지 않고 이미 놓여 있는 닫는 부호를 지나친다.
    view.dispatch({
      changes: lead.length > 0 ? { from, to, insert: lead } : undefined,
      selection: { anchor: from + lead.length + action.close.length },
      userEvent: 'input.type',
      scrollIntoView: true
    })
    return true
  }

  const insert = lead + action.open + action.close
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + lead.length + action.open.length },
    userEvent: 'input.type',
    scrollIntoView: true
  })
  return true
})

/**
 * Backspace — 빈 짝(`"|"`) 사이면 두 부호를 함께 지운다.
 * 짝이 아니면 false를 돌려 기본 동작(한 글자 지우기·마크다운 마커 지우기)으로 넘긴다.
 */
export const deleteQuotePair: Command = (view) => {
  if (!useSettings.getState().autoPairQuotes) return false
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const before = state.doc.sliceString(Math.max(0, sel.from - 1), sel.from)
  const after = state.doc.sliceString(sel.from, Math.min(state.doc.length, sel.from + 1))
  if (!emptyQuotePair(before, after)) return false
  view.dispatch({
    changes: { from: sel.from - before.length, to: sel.from + after.length },
    userEvent: 'delete.backward'
  })
  return true
}
