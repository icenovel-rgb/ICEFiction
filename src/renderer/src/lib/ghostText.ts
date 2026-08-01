/**
 * 고스트 텍스트(BLUEPRINT §6.1a) — AI 제안을 커서 뒤에 **흐린 글씨로** 미리 보여 준다.
 *
 * 원고는 AI가 멋대로 고치지 않는다(§7.4). 제안은 문서에 들어가 있지 않은 '유령'이고, 사용자가
 * Tab을 눌러야 비로소 진짜 글자가 된다(Esc면 사라진다). 연필로 흐리게 밑그림을 그려 두고,
 * 마음에 들 때만 펜으로 덧그리는 것과 같다.
 *
 * **약속은 눈에 보여야 지켜진다** — 흐린 글씨 끝에 `Tab 확정 · Esc 취소` 꼬리표를 함께 그린다.
 * 꼬리표도 위젯 안(=문서 밖)이라 원고에는 한 글자도 남지 않는다.
 *
 * 구현: 문서를 건드리지 않는 **위젯 데코레이션** 하나. 스트리밍 중에는 effect로 글자를 이어 붙인다.
 */
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { getEditorView } from './editorBridge'

/** streaming = 아직 받는 중(Esc면 중지) · ready = 다 받았다(Tab이면 확정). */
export type GhostStatus = 'streaming' | 'ready'

export interface GhostState {
  /** 제안이 들어갈 자리(문서 오프셋) */
  from: number
  /** 여기까지를 제안으로 **교체**한다. from과 같으면 순수 삽입(이어쓰기). */
  to: number
  /** 지금까지 받은 제안 글자 */
  text: string
  /** 지금 상태 — 꼬리표 문구가 이걸 따라간다 */
  status: GhostStatus
  /** 이 제안을 만든 명령(예: `/이어쓰기`) — 안내 막대에 그대로 쓴다 */
  label: string
}

/** null이면 제안 지우기. */
const setGhost = StateEffect.define<GhostState | null>()

/** 꼬리표 문구 — 지금 무슨 키를 누르면 무슨 일이 나는지 한 줄로. */
function tagText(status: GhostStatus, label: string): string {
  const who = label || 'AI 제안'
  return status === 'streaming' ? `${who} 쓰는 중… Esc 중지` : `${who} · Tab 확정 · Esc 취소`
}

class GhostWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly status: GhostStatus,
    readonly label: string
  ) {
    super()
  }
  eq(other: GhostWidget): boolean {
    return other.text === this.text && other.status === this.status && other.label === this.label
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-ghost'
    wrap.dataset.status = this.status
    if (this.text) {
      const body = document.createElement('span')
      body.className = 'cm-ghost-text'
      body.textContent = this.text
      wrap.appendChild(body)
    }
    const tag = document.createElement('span')
    tag.className = 'cm-ghost-tag'
    tag.textContent = tagText(this.status, this.label)
    wrap.appendChild(tag)
    return wrap
  }
  /** 위젯 위 클릭·입력이 에디터로 새지 않게. */
  ignoreEvent(): boolean {
    return true
  }
}

export const ghostField = StateField.define<GhostState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value
    // 사용자가 글자를 치면 제안은 버린다 — 흐린 글씨가 엉뚱한 자리에 남는 것을 막는다.
    if (tr.docChanged) return null
    return value
  },
  provide: (f) =>
    EditorView.decorations.from(f, (v): DecorationSet =>
      // 아직 한 글자도 못 받았어도 스트리밍 중이면 그린다 — "부르긴 했나?" 하는 공백을 없앤다.
      v && (v.text || v.status === 'streaming')
        ? Decoration.set([
            Decoration.widget({
              widget: new GhostWidget(v.text, v.status, v.label),
              side: 1
            }).range(Math.max(v.from, v.to))
          ])
        : Decoration.none
    )
})

/** 지금 떠 있는 제안(없으면 null). */
export function getGhost(view = getEditorView()): GhostState | null {
  return view ? view.state.field(ghostField, false) ?? null : null
}

/** 제안을 새로 띄운다(스트리밍 시작 시 글자 없이). to를 주면 그 범위를 갈아끼우는 제안이 된다. */
export function showGhost(g: {
  from: number
  to?: number
  text?: string
  status?: GhostStatus
  label?: string
}): void {
  getEditorView()?.dispatch({
    effects: setGhost.of({
      from: g.from,
      to: g.to ?? g.from,
      text: g.text ?? '',
      status: g.status ?? 'ready',
      label: g.label ?? ''
    })
  })
}

/**
 * 스트리밍 델타를 이어 붙인다.
 *
 * `tidy`를 주면 **누적본 전체**에 적용한다 — 문단 정리처럼 델타 경계를 걸쳐야 하는 손질
 * (예: `\n`으로 끝난 조각 + `\n`으로 시작하는 조각) 때문이다. 그래서 tidy는 멱등이어야 한다.
 */
export function appendGhost(delta: string, tidy?: (text: string) => string): void {
  const view = getEditorView()
  const cur = getGhost(view)
  if (!view || !cur) return
  const next = cur.text + delta
  view.dispatch({ effects: setGhost.of({ ...cur, text: tidy ? tidy(next) : next }) })
}

/** 제안을 본문에 확정한다(Tab). 제안이 없으면 false를 돌려 다른 키 동작에 양보한다. */
export function acceptGhost(view = getEditorView()): boolean {
  const cur = getGhost(view)
  if (!view || !cur || !cur.text) return false
  const len = view.state.doc.length
  const from = Math.min(cur.from, len)
  const to = Math.min(Math.max(cur.to, from), len)
  view.dispatch({
    changes: { from, to, insert: cur.text },
    selection: { anchor: from + cur.text.length },
    effects: setGhost.of(null)
  })
  view.focus()
  return true
}

/** 제안을 버린다(Esc). 버릴 게 없으면 false. */
export function clearGhost(view = getEditorView()): boolean {
  if (!getGhost(view)) return false
  view?.dispatch({ effects: setGhost.of(null) })
  return true
}
