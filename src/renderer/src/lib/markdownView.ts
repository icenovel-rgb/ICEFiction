/**
 * 마크다운 라이브 프리뷰(BLUEPRINT §6.1) — Obsidian 방식.
 *  · 스타일: 제목·굵게·기울임·인용·코드·링크 시각 적용(HighlightStyle)
 *  · 기호 숨김: 커서가 없는 줄에서는 마크다운 기호(#, **, `, ~~)를 감춰 결과만 보이게
 *  · 이미지: ![[경로]] / ![](경로)를 실제 <img>로 인라인 렌더 (커서가 그 줄이면 소스 노출→편집)
 */
import { syntaxHighlighting, HighlightStyle, syntaxTree } from '@codemirror/language'
import { type EditorState, StateField } from '@codemirror/state'
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
import { scanAlignBlocks, type BlockAlign } from '../../../shared/align'
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
  // 인용문 본문은 --md-muted(55%)를 쓰면 종이 위에서 너무 흐려 안 읽힌다(사용자 지적).
  // 좌측 바가 이미 "인용"임을 알려주므로, 글자는 본문에 가깝게 진하게 둔다.
  { tag: t.quote, color: 'var(--md-quote)', fontStyle: 'italic' }
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

// ── 문단 정렬 블록(<div align="…">) 렌더 ──
// 태그 줄은 통째로 감추고(block replace) 안쪽 줄에만 정렬 클래스를 입힌다. 커서가 그 블록 안에 있으면
// 태그를 다시 드러내 편집할 수 있게 한다(태그 줄은 감춰지면 아톰이라 커서가 못 들어가므로 '줄' 단위가
// 아니라 '블록' 단위로 판정해야 한다 — 제목의 #·인용의 > 와 다른 점).
const alignLineDeco: Record<BlockAlign, Decoration> = {
  left: Decoration.line({ class: 'cm-align-left' }),
  center: Decoration.line({ class: 'cm-align-center' }),
  right: Decoration.line({ class: 'cm-align-right' }),
  justify: Decoration.line({ class: 'cm-align-justify' })
}
const hiddenBlock = Decoration.replace({ block: true })

/** 선택(커서)이 [from,to] 안에 걸쳐 있는가 — 정렬 블록 전체 기준. */
function selectionTouchesRange(view: EditorView, from: number, to: number): boolean {
  return view.state.selection.ranges.some((r) => r.from <= to && r.to >= from)
}

/**
 * 정렬 블록 데코를 만든다. **ViewPlugin이 아니라 StateField로 제공해야 한다** —
 * CM6는 줄바꿈을 넘나드는 replace(block: true) 데코를 플러그인에서 받지 않는다(세로 레이아웃에
 * 영향을 주기 때문). 플러그인에 넣으면 데코 세트 전체가 무효가 된다(실측: 정렬 클래스까지 통째로 사라짐).
 */
function buildAlignDecos(state: EditorState): DecorationSet {
  const doc = state.doc
  const lines = doc.toString().split('\n')
  const ranges: ReturnType<Decoration['range']>[] = []
  const touches = (from: number, to: number): boolean =>
    state.selection.ranges.some((r) => r.from <= to && r.to >= from)

  for (const b of scanAlignBlocks(lines)) {
    const openLine = doc.line(b.open + 1)
    const closeLine = doc.line(b.close + 1)
    const inside = touches(openLine.from, closeLine.to)

    // 안쪽 내용 줄(빈 줄 제외)에 정렬 클래스.
    const content: number[] = []
    for (let k = b.open + 1; k <= b.close - 1; k += 1) {
      if ((lines[k] ?? '').trim() !== '') content.push(k)
    }
    for (const k of content) {
      ranges.push(alignLineDeco[b.align].range(doc.line(k + 1).from))
    }

    if (inside) continue // 커서가 블록 안 → 태그를 드러내 편집 가능하게

    // 태그 줄만 감춘다. 범위는 **그 줄 안에서 끝나야 한다** — 다음 줄의 시작(line.from)까지 물면
    // 그 줄에 붙인 라인 데코(정렬 클래스)가 replace 범위에 먹혀 사라진다(실측: 첫 줄만 정렬 누락).
    ranges.push(hiddenBlock.range(openLine.from, openLine.to))
    if (closeLine.from !== openLine.from) {
      ranges.push(hiddenBlock.range(closeLine.from, closeLine.to))
    }
  }
  return Decoration.set(ranges, true)
}

const alignField = StateField.define<DecorationSet>({
  create: (state) => buildAlignDecos(state),
  update: (deco, tr) =>
    tr.docChanged || tr.selection ? buildAlignDecos(tr.state) : deco.map(tr.changes),
  provide: (f) => [
    EditorView.decorations.from(f),
    // 감춘 태그 줄은 아톰으로 — 커서가 그 안으로 들어가지 않게.
    EditorView.atomicRanges.of((view) => view.state.field(f))
  ]
})

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
  // 정렬 블록은 여기 넣지 않는다 — block 데코라 StateField(alignField)로 따로 제공한다.
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
    borderLeft: '3px solid color-mix(in srgb, var(--paper-text) 45%, transparent)',
    paddingLeft: '14px',
    background: 'color-mix(in srgb, var(--paper-text) 5%, transparent)'
  },
  // 문단 정렬(선택 부분만) — 줄 요소에 직접 text-align을 주면 .cm-content가 물려준 기본 정렬을 덮는다
  // (상속값은 항상 요소에 직접 선언된 값보다 약하다).
  '.cm-line.cm-align-left': { textAlign: 'left' },
  '.cm-line.cm-align-center': { textAlign: 'center' },
  '.cm-line.cm-align-right': { textAlign: 'right' },
  '.cm-line.cm-align-justify': { textAlign: 'justify' }
})

/** Editor에 추가할 마크다운 라이브 프리뷰 확장(스타일 + 기호 숨김 + 이미지 + 인용 블록 + 문단 정렬). */
export const markdownExtras = [
  syntaxHighlighting(markdownHighlight),
  livePreview,
  alignField, // 정렬 블록(block 데코) — 플러그인이 아닌 StateField로만 제공 가능
  quoteTheme
]
