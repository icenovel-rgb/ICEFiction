/**
 * 에디터 명령 — 탭 들여쓰기 + 선택 문단 정렬(BLUEPRINT §6.1).
 *
 * 들여쓰기: 탭키는 **전각 공백(U+3000) 1칸**을 넣는다. 한국 소설 원고의 표준 들여쓰기이자,
 * 마크다운이 코드블록으로 오인하지 않는 유일하게 안전한 선택이다(탭문자·4칸 공백은 코드블록이 된다).
 *
 * 정렬: 선택한 줄을 <div align="…">로 감싼다(shared/align.ts의 순수 로직을 그대로 쓴다).
 */
import type { Command, EditorView } from '@codemirror/view'
import { setAlign, type BlockAlign } from '../../../shared/align'
import { BOLD, ITALIC, toggleMark, UNDERLINE, type MarkStyle } from '../../../shared/inlineMark'
import { SOFT_BREAK } from '../../../shared/paraGap'

/** 전각 공백 — 한글 원고 들여쓰기 한 칸. */
export const INDENT = '　'

/** 그 줄이 이미 들여쓰기(전각공백/공백)로 시작하면 몇 글자인지. */
function leadingIndentLen(line: string): number {
  const m = line.match(/^[　\t ]/)
  return m ? m[0].length : 0
}

/**
 * Tab — 들여쓰기.
 *  · 커서만 있으면 그 자리에 전각 공백 삽입
 *  · 여러 줄을 선택했으면 각 줄 앞에 전각 공백을 붙인다(문단 통째 들여쓰기)
 */
export const indentWithFullWidthSpace: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  const startLine = state.doc.lineAt(sel.from)
  const endLine = state.doc.lineAt(sel.to)

  // 여러 줄 선택 → 줄마다 앞에 한 칸
  if (startLine.number !== endLine.number) {
    const changes = []
    for (let n = startLine.number; n <= endLine.number; n += 1) {
      const line = state.doc.line(n)
      if (line.length === 0) continue // 빈 줄은 건드리지 않는다
      changes.push({ from: line.from, insert: INDENT })
    }
    if (changes.length === 0) return false
    view.dispatch({ changes, userEvent: 'input.indent' })
    return true
  }

  // 커서(또는 한 줄 선택) → 선택을 지우고 그 자리에 한 칸
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: INDENT },
    selection: { anchor: sel.from + INDENT.length },
    userEvent: 'input.indent'
  })
  return true
}

/**
 * Shift+Tab — 들여쓰기 제거. 각 줄 앞의 전각공백/탭/공백 한 칸을 걷어낸다.
 */
export const outdentFullWidthSpace: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  const startLine = state.doc.lineAt(sel.from)
  const endLine = state.doc.lineAt(sel.to)
  const changes = []
  for (let n = startLine.number; n <= endLine.number; n += 1) {
    const line = state.doc.line(n)
    const len = leadingIndentLen(line.text)
    if (len > 0) changes.push({ from: line.from, to: line.from + len })
  }
  if (changes.length === 0) return false
  view.dispatch({ changes, userEvent: 'delete.dedent' })
  return true
}

/**
 * 선택한 부분만 정렬한다(align=null이면 해제 → 문서 기본 정렬로 되돌림).
 * 문서를 통째로 교체하지만 한 트랜잭션이라 되돌리기(Ctrl+Z) 한 번에 원복된다.
 */
export function alignSelection(view: EditorView, align: BlockAlign | null): boolean {
  const { state } = view
  const sel = state.selection.main
  const startLine = state.doc.lineAt(sel.from).number - 1 // 0-based
  const endLine = state.doc.lineAt(sel.to).number - 1
  const before = state.doc.toString()
  const lines = before.split('\n')

  const res = setAlign(lines, startLine, endLine, align)
  const next = res.lines.join('\n')
  if (next === before) return false

  // 새 문서에서 내용 줄의 시작·끝 오프셋을 다시 계산해 선택을 복원한다.
  let anchor = 0
  for (let i = 0; i < res.startLine; i += 1) anchor += res.lines[i].length + 1
  let head = anchor
  for (let i = res.startLine; i <= res.endLine; i += 1) {
    head += res.lines[i].length + (i < res.endLine ? 1 : 0)
  }

  view.dispatch({
    changes: { from: 0, to: state.doc.length, insert: next },
    selection: { anchor, head },
    userEvent: 'input.align'
  })
  view.focus()
  return true
}

/** 키맵용 — Ctrl+Shift+{L,E,R,J} 로 선택 문단 정렬, Ctrl+Shift+0 으로 해제. */
export function alignCommand(align: BlockAlign | null): Command {
  return (view) => alignSelection(view, align)
}

/**
 * Shift+Enter — **문단 간격이 붙지 않는** 줄바꿈(§8.1). 줄간격만 적용된 다음 줄로 내려간다.
 *
 * 파일에는 마크다운 표준 하드 브레이크(줄 끝 공백 두 칸)로 남긴다 — 원고에 보이는 기호를 남기지
 * 않으면서 깃허브·옵시디언·pandoc이 모두 `<br>`로 읽는다. 화면에서는 markdownView가 그 줄을
 * `.cm-soft-break`으로 표시해 아래 여백을 0으로 되돌린다.
 *
 * 커서 앞에 이미 공백이 있으면 그만큼 먹고 넣는다 — Shift+Enter를 여러 번 눌러도 공백이 쌓이지 않게.
 */
export const softBreak: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.from)
  const head = state.doc.sliceString(line.from, sel.from)
  const trailing = /[ \t]*$/.exec(head)?.[0].length ?? 0
  const from = sel.from - trailing
  const insert = SOFT_BREAK + state.lineBreak
  view.dispatch({
    changes: { from, to: sel.to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input',
    scrollIntoView: true
  })
  return true
}

/**
 * 굵게·기울임·밑줄 토글(§6.1d) — Ctrl+B / Ctrl+I / Ctrl+U.
 * 판단은 순수 함수(shared/inlineMark.ts)가 하고 여기서는 한 트랜잭션으로 반영만 한다(Ctrl+Z 한 번에 원복).
 */
function markCommand(style: MarkStyle): Command {
  return (view) => {
    const { state } = view
    const sel = state.selection.main
    const edit = toggleMark(state.doc.toString(), sel.from, sel.to, style)
    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.insert },
      selection: { anchor: edit.anchor, head: edit.head },
      userEvent: 'input.format',
      scrollIntoView: true
    })
    return true
  }
}

export const toggleBold = markCommand(BOLD)
export const toggleItalic = markCommand(ITALIC)
export const toggleUnderline = markCommand(UNDERLINE)

/** '>' 만 있고 내용이 없는 인용 줄인가(예: ">", "> ", ">>"). */
const EMPTY_QUOTE_RE = /^\s*>[\s>]*$/

/**
 * Enter — 빈 인용 줄에서 누르면 **인용문을 빠져나온다**.
 *
 * lang-markdown의 기본 동작(insertNewlineContinueMarkup)은 인용을 계속 이어붙이고,
 * **빈 인용 줄이 두 번 연속돼야만** 탈출한다 → 사용자는 Enter를 세 번 눌러야 하고, 모르면 이후 본문이
 * 통째로 인용문에 갇힌다(실측: "> 인용\n>\n> 다시 본문"). 그래서 Enter 한 번에 빠져나오게 한다.
 *
 * 줄 내용을 지우고 **줄바꿈을 남겨** 인용과 다음 문단 사이에 빈 줄을 만든다 — 빈 줄이 없으면 마크다운의
 * lazy continuation 때문에 다음 문단이 다시 인용문으로 빨려 들어간다.
 *
 * 빈 인용 줄이 아니면 false를 돌려줘 기본 동작(인용·목록 이어쓰기)에 넘긴다.
 */
export const exitQuoteOnEmptyLine: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  if (!EMPTY_QUOTE_RE.test(line.text)) return false
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: state.lineBreak },
    selection: { anchor: line.from + state.lineBreak.length },
    userEvent: 'input'
  })
  return true
}
