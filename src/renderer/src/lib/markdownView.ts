/**
 * 마크다운 라이브 프리뷰(BLUEPRINT §6.1) — Obsidian 방식.
 *  · 스타일: 제목·굵게·기울임·인용·코드·링크 시각 적용(HighlightStyle)
 *  · 기호 숨김: 커서가 없는 줄에서는 마크다운 기호(#, **, `, ~~)를 감춰 결과만 보이게
 *  · 이미지: ![[경로]] / ![](경로)를 실제 <img>로 인라인 렌더 (커서가 그 줄이면 소스 노출→편집)
 */
import { syntaxHighlighting, HighlightStyle, syntaxTree } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { EMBED_RE, embedToRootRel } from '../../../shared/mdEmbed'
import { useStore } from '../state/store'
import { useLightbox } from '../ui/lightbox'

// 색은 앱 크롬용 변수(--accent-hi/--muted)가 아니라 **종이색 기준**(--md-*, global.css)으로.
// 세피아·화이트·다크 어느 배경에서도 대비가 유지된다(사용자 지적: 색이 안 보임).
const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.7em', fontWeight: '700', lineHeight: '1.5' },
  { tag: t.heading2, fontSize: '1.45em', fontWeight: '700', lineHeight: '1.5' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '700' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--md-link)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--md-muted)' },
  {
    tag: t.monospace,
    fontFamily: 'ui-monospace, Consolas, monospace',
    background: 'var(--md-code-bg)',
    borderRadius: '3px',
    padding: '0 3px'
  },
  { tag: t.quote, color: 'var(--md-muted)', fontStyle: 'italic' }
])

// ── 구분선(--- / *** / ___) 렌더 ── 커서가 없는 줄에서는 실제 가로선 위젯으로 바꾼다(사용자 지적).
class HrWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-hr'
    return el
  }
  ignoreEvent(): boolean {
    return true
  }
}

function hrDecos(view: EditorView, add: (from: number, to: number, d: Decoration) => void): void {
  const tree = syntaxTree(view.state)
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'HorizontalRule') return
        if (selectionTouchesLine(view, node.from)) return // 그 줄에 커서 → 소스(---) 노출
        add(node.from, node.to, Decoration.replace({ widget: new HrWidget() }))
      }
    })
  }
}

/** 현재 선택(커서)이 [from,to] 줄에 걸쳐 있으면 true — 그 줄은 소스를 노출(편집 가능). */
function selectionTouchesLine(view: EditorView, from: number): boolean {
  const line = view.state.doc.lineAt(from)
  return view.state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from)
}

// ── 이미지 인라인 렌더 (![[..]] / ![](..)) ──
class ImageWidget extends WidgetType {
  constructor(readonly path: string) {
    super()
  }
  eq(other: ImageWidget): boolean {
    return other.path === this.path
  }
  toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.className = 'cm-inline-image'
    img.src = window.api.assetUrl(this.path)
    img.alt = this.path
    img.draggable = false // 인라인 이미지 드래그로 '자료 반입' 오버레이가 뜨지 않게
    img.addEventListener('mousedown', (e) => {
      e.preventDefault()
      useLightbox.getState().open([{ path: this.path, kind: 'image' }], 0)
    })
    return img
  }
  ignoreEvent(): boolean {
    return true
  }
}

function imageDecos(view: EditorView, add: (from: number, to: number, d: Decoration) => void): void {
  const docPath = useStore.getState().activePath
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to)
    EMBED_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = EMBED_RE.exec(text))) {
      const start = from + m.index
      const end = start + m[0].length
      const raw = (m[1] || m[2] || '').trim()
      if (!raw || /^[a-z]+:/i.test(raw)) continue // http(s)·data 등 외부 URL은 그대로 둠
      if (selectionTouchesLine(view, start)) continue // 그 줄에 커서 → 소스 노출
      // 표준 임베드는 문서 기준 상대경로, 위키링크는 루트 기준 — 둘 다 루트 기준으로 정규화해 렌더.
      const rootRel = embedToRootRel(raw, m[1] != null, docPath)
      add(start, end, Decoration.replace({ widget: new ImageWidget(rootRel) }))
    }
  }
}

// ── 기호 숨김(라이브 프리뷰) ──
// QuoteMark(>)도 포함 — 커서 없는 줄에선 '>'를 감추고 인용 블록(좌측 바)만 보이게(사용자 지적: 인용문 미작동).
const HIDE_MARKS = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark', 'QuoteMark'])
const hidden = Decoration.replace({})

function markHideDecos(view: EditorView, add: (from: number, to: number, d: Decoration) => void): void {
  const tree = syntaxTree(view.state)
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (!HIDE_MARKS.has(node.name)) return
        if (selectionTouchesLine(view, node.from)) return // 편집 중인 줄은 기호 노출
        // HeaderMark(#)·QuoteMark(>) 뒤 공백까지 함께 숨겨 결과 텍스트가 왼쪽에 붙게.
        let end = node.to
        if (
          (node.name === 'HeaderMark' || node.name === 'QuoteMark') &&
          view.state.doc.sliceString(end, end + 1) === ' '
        ) {
          end += 1
        }
        add(node.from, end, hidden)
      }
    })
  }
}

// ── 인용 블록(Blockquote) 라인 렌더 ── 좌측 바 + 들여쓰기(.cm-blockquote). 커서 여부와 무관하게 표시.
const quoteLine = Decoration.line({ class: 'cm-blockquote' })

function blockquoteDecos(view: EditorView, addLine: (lineFrom: number) => void): void {
  const tree = syntaxTree(view.state)
  const seen = new Set<number>()
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'Blockquote') return
        // 이 인용 블록이 걸친 모든 줄에 라인 데코를 붙인다(중첩 인용은 같은 줄 중복을 seen으로 제거).
        let pos = node.from
        for (;;) {
          const line = view.state.doc.lineAt(pos)
          if (!seen.has(line.from)) {
            seen.add(line.from)
            addLine(line.from)
          }
          if (line.to >= node.to) break
          pos = line.to + 1
        }
      }
    })
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  // 라인 데코(인용 블록)와 인라인 replace 데코(기호 숨김·이미지·구분선)가 섞이므로
  // 수동 정렬 대신 Decoration.set(ranges, true)에 정렬을 맡긴다(라인/인라인 side 처리까지 정확).
  const ranges: ReturnType<Decoration['range']>[] = []
  const push = (from: number, to: number, d: Decoration): void => {
    ranges.push(d.range(from, to))
  }
  markHideDecos(view, push)
  hrDecos(view, push)
  imageDecos(view, push)
  blockquoteDecos(view, (lineFrom) => ranges.push(quoteLine.range(lineFrom)))
  return Decoration.set(ranges, true)
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildDecorations(u.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // 숨김/이미지 replace 데코가 아톰이 되도록(커서가 통과하지 않게)
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none)
  }
)

// 인용 블록 좌측 바·들여쓰기 — `.cm-line.cm-blockquote`(2클래스)로 paperTheme의 `.cm-line{padding:0}`을
// 특이도로 이겨 들여쓰기가 확실히 먹게 한다. 색은 종이색(--paper-text)에서 파생해 어느 테마에서도 대비 유지.
const quoteTheme = EditorView.theme({
  '.cm-line.cm-blockquote': {
    borderLeft: '3px solid color-mix(in srgb, var(--paper-text) 30%, transparent)',
    paddingLeft: '14px',
    background: 'color-mix(in srgb, var(--paper-text) 4%, transparent)'
  }
})

/** Editor에 추가할 마크다운 라이브 프리뷰 확장(스타일 + 기호 숨김 + 인라인 이미지 + 인용 블록). */
export const markdownExtras = [syntaxHighlighting(markdownHighlight), livePreview, quoteTheme]
