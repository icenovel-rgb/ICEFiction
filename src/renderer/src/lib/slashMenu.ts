/**
 * 슬래시 메뉴(BLUEPRINT §6.1b) — 본문에서 `/`를 치면 뜨는 AI 명령 목록.
 *
 * CodeMirror의 자동완성 위에 얹는다. 고른 명령은 `/…` 글자를 지우고 그 자리에서 실행된다.
 * 결과는 고스트 텍스트(§6.1a)로 흐리게 미리 보이고, Tab을 눌러야 원고에 들어간다.
 *
 * 메뉴는 **고르기 전에 결과가 어디로 갈지** 말해 준다 — 줄마다 아이콘·설명·꼬리표(Tab 확정 /
 * 문서 정보로 / 그림 창 열기)를 두고, 머리말과 발치에 조작 키를 적는다(CSS의 ::before·::after).
 */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { useAi } from '../state/ai'
import { useStore } from '../state/store'
import { useImageStudio } from '../ui/imageStudio'
import { beforeText, paragraphAt, SLASH_COMMANDS, type SlashCommand } from '../../../shared/slashCommands'

/** 라벨 → 명령. 자동완성이 돌려주는 건 Completion이라, 그릴 때 원래 명령을 되찾는 통로가 필요하다. */
const BY_LABEL = new Map(SLASH_COMMANDS.map((c) => [c.label, c]))

/** 명령을 실행하기 전에 화면에서 `/이어쓰기` 글자를 지운다 — 원고에 남으면 안 된다. */
function runCommand(view: EditorView, cmd: SlashCommand, from: number, to: number): void {
  view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
  view.focus()

  const state = view.state
  const doc = state.doc.toString()
  const activePath = useStore.getState().activePath

  if (cmd.kind === 'image') {
    if (!activePath) {
      useAi.getState().notify('문서를 먼저 열고 /삽화를 실행하세요.')
      return
    }
    useImageStudio.getState().open({ kind: 'inline', path: activePath })
    return
  }

  // 갈아끼우는 명령(/다듬기)의 대상 = 커서가 놓인 문단. `/`를 치는 순간 선택은 이미 지워진다.
  const range = cmd.replaces ? paragraphAt(doc, from) : null
  if (cmd.replaces && !range) {
    useAi.getState().notify(`${cmd.label}: 커서를 다듬을 문단 안에 두고 다시 실행하세요.`)
    return
  }

  void useAi.getState().runInline(
    cmd,
    {
      before: beforeText(doc, from),
      selection: range ? doc.slice(range.from, range.to) : '',
      title: activePath ?? ''
    },
    range ?? { from, to: from }
  )
}

/** 목록 한 줄에 덧붙이는 작은 조각(아이콘·꼬리표). 우리 명령이 아니면 아무것도 그리지 않는다. */
function part(cls: string, pick: (cmd: SlashCommand) => string) {
  return (completion: Completion): Node | null => {
    const cmd = BY_LABEL.get(completion.label)
    if (!cmd) return null
    const el = document.createElement('span')
    el.className = cls
    el.textContent = pick(cmd)
    return el
  }
}

/**
 * `/`로 시작하는 낱말에서만 뜬다. 경로(`assets/…`)나 날짜(`2026/07`) 한가운데서 튀어나오지 않게
 * **줄 첫머리나 공백 뒤**의 `/`만 인정한다.
 */
function slashSource(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/\/[^\s/]*/)
  if (!word) return null
  if (word.from === word.to && !ctx.explicit) return null
  const prev = word.from > 0 ? ctx.state.sliceDoc(word.from - 1, word.from) : ''
  if (prev && !/\s/.test(prev)) return null

  return {
    from: word.from,
    options: SLASH_COMMANDS.map((cmd, i) => ({
      label: cmd.label,
      detail: cmd.detail,
      type: cmd.kind === 'image' ? 'class' : 'keyword',
      // 자동완성은 기본이 가나다순이라 카탈로그 순서(가장 많이 쓰는 /이어쓰기가 먼저)가 무너진다.
      // boost로 우리 순서를 되살린다 — `/`만 쳤을 때 맨 위에 /이어쓰기가 잡혀 있어야 한다.
      boost: (SLASH_COMMANDS.length - i) * 10,
      apply: (view: EditorView, _c: unknown, from: number, to: number) =>
        runCommand(view, cmd, from, to)
    }))
  }
}

export function slashMenu(): Extension {
  return autocompletion({
    override: [slashSource],
    activateOnTyping: true,
    icons: false, // CM 기본 아이콘(색 네모) 대신 명령별 그림글자를 직접 그린다
    tooltipClass: () => 'ice-slash', // 머리말·발치 문구는 이 클래스에 CSS로 붙인다
    optionClass: (c) => (BY_LABEL.has(c.label) ? 'ice-slash-opt' : ''),
    addToOptions: [
      { render: part('ice-slash-icon', (c) => c.icon), position: 10 }, // 라벨(50)·설명(80) 사이에 끼우지 않고
      { render: part('ice-slash-outcome', (c) => c.outcome), position: 90 } // 맨 오른쪽 꼬리표
    ],
    // 한글 조합 중에는 자동완성이 글자를 가로채지 못하게 한다(IME 안전).
    closeOnBlur: true
  })
}
