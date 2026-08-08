/**
 * 줄표 줄 내어쓰기(BLUEPRINT §8.1 — 사용자 요청) — 넘어간 줄을 줄표 뒤 **글자**에 맞춘다.
 *
 * 문제: 줄표(`— · • · - `)로 시작한 줄이 길어서 다음 줄로 넘어가면, 넘어간 줄이 줄표 **밑**에서
 * 시작해 어디까지가 한 덩이인지 흐려진다.
 *
 * ```
 *  지금            바꾸면
 *  — 그가 말을     — 그가 말을
 *  하려다 말았다.     하려다 말았다.
 * ```
 *
 * 고치는 법은 조판의 기본 — **내어쓰기**다. 첫 줄만 밖으로 내고(`text-indent: -폭`) 줄 전체를
 * 그만큼 안으로 밀면(`padding-left: 폭`), 넘어간 줄이 정확히 줄표 뒤 글자 자리에서 시작한다.
 *
 * **폭은 재야 한다.** 1.5em처럼 고정값을 쓰면 글꼴마다 줄표 폭이 달라 한두 픽셀씩 어긋난다
 * ("줄맞춤"인데 안 맞으면 안 한 것만 못하다). 그래서 캔버스로 줄표 머리의 실제 폭을 재고,
 * **em으로 환산해** 넣는다 — 글자 크기를 바꿔도 CSS가 알아서 따라간다(다시 잴 필요가 없다).
 *
 * 원고 파일에는 공백 한 칸도 넣지 않는다(§6.11 이식성) — 화면 조판만 바뀐다.
 */
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { dashLead } from '../../../shared/dash'

/** 글자 폭 자는 캔버스 한 장 — DOM에 아무것도 붙이지 않고 잰다. */
const measurer = document.createElement('canvas').getContext('2d')

/** `글꼴|머리` → em 폭. 같은 줄표 머리를 줄마다 다시 재지 않는다. */
const widthCache = new Map<string, number>()

/**
 * 줄표 머리의 폭(em). 못 재면 0(내어쓰기를 걸지 않는다 — 어긋난 조판보다 낫다).
 *
 * 글꼴을 바꾸면 잠깐 옛 폭이 남을 수 있지만, 원고를 한 번 누르거나 한 글자만 쳐도 다시 그려진다
 * (데코는 선택·편집 때마다 다시 만든다). 그 정도 지연은 눈에 띄지 않는다.
 */
function leadWidthEm(view: EditorView, lead: string): number {
  if (!measurer) return 0
  const cs = getComputedStyle(view.contentDOM)
  const px = parseFloat(cs.fontSize)
  if (!Number.isFinite(px) || px <= 0) return 0
  const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  const key = `${font}|${lead}`
  const hit = widthCache.get(key)
  if (hit != null) return hit
  measurer.font = font
  const em = measurer.measureText(lead).width / px
  widthCache.set(key, em)
  return em
}

/** 소수점 세 자리면 충분하다 — 그 아래는 화면에서 반올림돼 사라진다. */
function hangStyle(em: number): string {
  const w = em.toFixed(3)
  return `text-indent:-${w}em;padding-left:${w}em`
}

function build(view: EditorView): DecorationSet {
  const doc = view.state.doc
  const ranges: ReturnType<Decoration['range']>[] = []
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    for (;;) {
      const line = doc.lineAt(pos)
      const lead = dashLead(line.text)
      if (lead) {
        const em = leadWidthEm(view, lead)
        // 인라인 style이라 보기 설정의 들여쓰기/내어쓰기(`--paper-indent`)를 확실히 덮는다 —
        // 줄표 줄은 문단이 아니라 목록처럼 다뤄야 한다.
        if (em > 0) ranges.push(Decoration.line({ attributes: { style: hangStyle(em) } }).range(line.from))
      }
      if (line.to >= to || line.to >= doc.length) break
      pos = line.to + 1
    }
  }
  return Decoration.set(ranges, true)
}

/** 줄표 줄 내어쓰기 — 라인 데코 하나뿐이라 마크다운 프리뷰(markdownView)와 따로 둔다. */
export const dashHang = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = build(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)
