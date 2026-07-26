/**
 * 본문 에디터 — CodeMirror 6(BLUEPRINT §6.1). ICE 제품군 첫 본문 에디터.
 *
 * 한글 IME 조합 입력은 CM6가 contentEditable 기반이라 네이티브로 처리한다(선택 이유 — §11).
 *
 * ⚠️ 호스트 div는 **항상 마운트**한다. 예전엔 activePath 없을 때 호스트를 렌더하지 않아,
 *   마운트 시 1회 실행되는 생성 effect가 빈손으로 끝나고 이후 문서를 열어도 EditorView가
 *   만들어지지 않아 입력이 안 됐다(실측 버그). 이제 오버레이로 빈 상태를 덮고 뷰는 상주시킨다.
 *
 * 동기화 루프 방지: 문서를 전환하며 프로그램이 내용을 갈아끼울 때는 syncing 플래그를 세워
 * updateListener가 그 변경을 사용자 입력으로 오인해 store에 되쓰지 않게 한다.
 */
import { useEffect, useRef, useState } from 'react'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { acceptCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { useAi } from '../state/ai'
import { useStore } from '../state/store'
import { setEditorView } from '../lib/editorBridge'
import { acceptGhost, clearGhost, ghostField, type GhostState } from '../lib/ghostText'
import { slashMenu } from '../lib/slashMenu'
import { markdownExtras } from '../lib/markdownView'
import {
  alignCommand,
  exitQuoteOnEmptyLine,
  indentWithFullWidthSpace,
  outdentFullWidthSpace
} from '../lib/editorCommands'
import { toStandardEmbed } from '../../../shared/mdEmbed'

/**
 * 집필 키맵 — **Prec.highest로 올려야 한다.** lang-markdown이 자기 키맵을 Prec.high로 넣기 때문에
 * (Enter → insertNewlineContinueMarkup), 기본 우선순위로는 우리 Enter가 절대 실행되지 않는다(실측).
 *
 * Tab = 전각 공백 들여쓰기(한글 원고 관례) · Enter = 빈 인용 줄이면 인용문 탈출 ·
 * Ctrl+Shift+{L,E,R,J} = 선택 문단 정렬, Ctrl+Shift+0 = 해제.
 */
const writingKeymap = [
  { key: 'Enter', run: exitQuoteOnEmptyLine }, // false면 마크다운 기본(인용·목록 이어쓰기)으로 넘어간다
  // AI 제안이 떠 있으면 Tab=채택 / Esc=버리기. 제안이 없으면 false를 돌려 기존 동작으로 넘긴다.
  { key: 'Tab', run: (v: EditorView) => acceptGhost(v) },
  // 슬래시 메뉴가 떠 있을 때도 Tab으로 고른다(Enter만 되면 "Tab=확정" 감각이 끊긴다).
  { key: 'Tab', run: acceptCompletion },
  {
    key: 'Escape',
    run: (v: EditorView) => {
      if (!clearGhost(v)) return false
      useAi.getState().cancel() // 생성 중이었다면 함께 멈춘다
      useAi.getState().notify(null)
      return true
    }
  },
  { key: 'Tab', run: indentWithFullWidthSpace },
  { key: 'Shift-Tab', run: outdentFullWidthSpace },
  { key: 'Mod-Shift-l', run: alignCommand('left') },
  { key: 'Mod-Shift-e', run: alignCommand('center') },
  { key: 'Mod-Shift-r', run: alignCommand('right') },
  { key: 'Mod-Shift-j', run: alignCommand('justify') },
  { key: 'Mod-Shift-0', run: alignCommand(null) }
]

// searchKeymap의 Mod-Shift-l(selectSelectionMatches)은 정렬 단축키(왼쪽 정렬)와 충돌 → 그 바인딩만 제외.
const searchKeys = searchKeymap.filter((b) => b.key !== 'Mod-Shift-l')

// 검색 패널(Ctrl+F) 문구 한국어화 — @codemirror/search가 쓰는 phrase 키 전부(누락 시 영어 잔존).
const koPhrases = EditorState.phrases.of({
  Find: '찾기',
  Replace: '바꾸기',
  next: '다음',
  previous: '이전',
  all: '모두',
  'match case': '대소문자 구분',
  'by word': '단어 단위',
  regexp: '정규식',
  replace: '바꾸기',
  'replace all': '모두 바꾸기',
  close: '닫기',
  'Go to line': '줄 이동',
  go: '이동',
  'current match': '현재 일치',
  'on line': '줄'
})

/** 인앱 자료 드래그의 dataTransfer에서 프로젝트 상대경로를 뽑는다(ice-asset URL 또는 커스텀 타입). */
function assetRelFromDrop(dt: DataTransfer): string {
  const custom = dt.getData('application/x-ice-asset')
  if (custom) return custom
  const raw = dt.getData('text/uri-list') || dt.getData('text/plain') || ''
  const m = raw.match(/ice-asset:\/\/asset\/(\S+)/i)
  if (!m) return ''
  return m[1]
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
    .join('/')
}

// 테마는 CSS 변수(--paper-*, --gutter-display)를 읽는다 — 설정 변경이 변수 갱신만으로 즉시 반영된다.
const paperTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--paper-bg)', color: 'var(--paper-text)' },
  '.cm-scroller': {
    fontFamily: 'var(--paper-font)',
    fontSize: 'var(--paper-fontsize)',
    lineHeight: 'var(--paper-lineheight)',
    padding: '32px 0',
    overflow: 'auto'
  },
  '.cm-content': {
    maxWidth: '740px',
    margin: '0 auto',
    padding: '0 28px',
    caretColor: 'var(--paper-text)',
    textAlign: 'var(--paper-align, justify)', // 문단 정렬(보기 설정) — 줄에 상속돼 양쪽/가운데 등 적용
    userSelect: 'text' // body의 user-select:none 상속 차단(입력·선택 보장)
  },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  // 줄번호 거터 — 종이에 녹아들게(투명 배경, 흐린 글자). display는 변수로 토글(줄번호 숨기기).
  '.cm-gutters': {
    display: 'var(--gutter-display, flex)',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'color-mix(in srgb, var(--paper-text) 35%, transparent)'
  },
  '.cm-cursor': { borderLeftColor: 'var(--paper-text)', borderLeftWidth: '2px' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--accent-soft)'
  }
})

/** 빈 문서에 흐리게 뜨는 안내 — `/`가 있다는 걸 아무 데도 안 적으면 아무도 못 찾는다. */
const PLACEHOLDER = '여기에 이야기를 쓰세요.  「/」를 치면 AI 명령(이어쓰기·다듬기·묘사·대사·줄거리·삽화)이 뜹니다.'

/**
 * AI 제안 안내 막대(§6.1a) — 흐린 글씨가 떠 있는 동안 본문 아래에 상주한다.
 *
 * 고스트 옆 꼬리표만으로는 스크롤 밖으로 밀리면 안 보이고, 마우스로 쓰는 사람에겐 누를 곳이 없다.
 * 그래서 같은 약속(Tab 확정 · Esc 취소)을 **누를 수 있는 단추**로 한 번 더 적는다.
 */
function GhostBar({ ghost, view }: { ghost: GhostState; view: EditorView | null }): React.ReactElement {
  const busy = ghost.status === 'streaming'
  const cancel = (): void => {
    clearGhost(view ?? undefined)
    if (busy) useAi.getState().cancel()
    useAi.getState().notify(null)
    view?.focus()
  }
  return (
    <div className={`ghost-bar${busy ? ' busy' : ''}`} role="status">
      <span className="ghost-bar-what">
        <b>{ghost.label || 'AI 제안'}</b>
        {busy ? ' 쓰는 중…' : ' — 흐린 글씨는 아직 원고에 없습니다'}
      </span>
      {!busy && (
        <button className="ghost-btn accept" onClick={() => acceptGhost(view ?? undefined)}>
          <kbd>Tab</kbd> 확정
        </button>
      )}
      <button className="ghost-btn" onClick={cancel}>
        <kbd>Esc</kbd> {busy ? '중지' : '취소'}
      </button>
    </div>
  )
}

/** 슬래시 명령이 남긴 한마디(실패·저장 완료). 잠시 뒤 스스로 사라진다. */
function NoticeBar({ text }: { text: string }): React.ReactElement {
  useEffect(() => {
    const t = setTimeout(() => useAi.getState().notify(null), 6000)
    return () => clearTimeout(t)
  }, [text])
  return (
    <div className="ghost-notice" role="status">
      {text}
      <button className="ghost-notice-x" onClick={() => useAi.getState().notify(null)} title="닫기">
        ✕
      </button>
    </div>
  )
}

export function Editor(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const syncingRef = useRef(false)
  const editableRef = useRef(new Compartment())
  const activePath = useStore((s) => s.activePath)
  const pendingJump = useStore((s) => s.pendingJump)
  // CM 안의 제안 상태를 React로 끌어온다(막대를 그리려면 필요하다).
  const [ghost, setGhost] = useState<GhostState | null>(null)
  const notice = useAi((s) => s.inlineNotice)

  // 뷰는 마운트 시 한 번만 생성 — 호스트는 항상 DOM에 있으므로 여기서 확실히 만들어진다.
  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: useStore.getState().body,
        extensions: [
          history(),
          Prec.highest(keymap.of(writingKeymap)), // markdown()의 Prec.high 키맵보다 위
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeys]),
          search({ top: true }), // 패널을 에디터 상단에 — 하단은 상태바와 겹쳐 어색
          highlightSelectionMatches(), // 드래그한 단어와 같은 단어를 은은히 표시
          koPhrases,
          markdown(),
          ...markdownExtras,
          ghostField, // AI 제안(흐린 글씨) — 문서를 건드리지 않는 위젯(§6.1a)
          slashMenu(), // 본문 `/` 명령(§6.1b)
          placeholder(PLACEHOLDER), // 빈 문서에서 `/`의 존재를 알린다
          // 이미지 드롭을 CM 레벨에서 가로챈다 — 기본 동작(파일/URL을 텍스트로 삽입)을 막고
          // 표준 마크다운 ![](문서기준 상대경로)로 삽입 → 인라인 렌더(§6.10) + 다른 앱에서도 열림.
          // OS 파일 드롭 + 인앱 자료 드래그(ice-asset URL) 둘 다.
          EditorView.domEventHandlers({
            drop(event, dropView) {
              const dt = event.dataTransfer
              if (!dt) return false
              const pos =
                dropView.posAtCoords({ x: event.clientX, y: event.clientY }) ??
                dropView.state.selection.main.head
              const insert = (rels: string[]): void => {
                const clean = rels.filter(Boolean)
                if (clean.length === 0) return
                const docPath = useStore.getState().activePath
                const md = '\n' + clean.map((p) => toStandardEmbed(p, docPath)).join('\n\n') + '\n'
                dropView.dispatch({
                  changes: { from: pos, insert: md },
                  selection: { anchor: pos + md.length }
                })
                dropView.focus()
              }
              // 1) OS 이미지 파일 → assets 반입 후 삽입
              const files = Array.from(dt.files).filter((f) => f.type.startsWith('image/'))
              if (files.length > 0) {
                event.preventDefault()
                event.stopPropagation() // App의 '자료 반입'과 중복 처리 방지
                const paths = files.map((f) => window.api.pathForFile(f)).filter(Boolean)
                void (async () => {
                  const res = await window.api.ingestFiles(paths)
                  await useStore.getState().loadAssets()
                  await useStore.getState().refreshTree()
                  insert(res.imported)
                })()
                return true
              }
              // 2) 인앱 자료 드래그(자료 갤러리·썸네일의 ice-asset URL) → 이미 반입돼 있으니 바로 임베드
              const rel = assetRelFromDrop(dt)
              if (rel) {
                event.preventDefault()
                event.stopPropagation()
                insert([rel])
                return true
              }
              return false
            }
          }),
          EditorView.lineWrapping,
          lineNumbers(),
          paperTheme,
          editableRef.current.of(
            EditorView.editable.of(useStore.getState().activePath != null)
          ),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !syncingRef.current) {
              useStore.getState().setBody(u.state.doc.toString())
            }
            // 제안이 생기고·자라고·사라질 때만 React에 알린다(매 입력마다 리렌더하지 않게).
            const now = u.state.field(ghostField, false) ?? null
            if (now !== (u.startState.field(ghostField, false) ?? null)) setGhost(now)
          })
        ]
      })
    })
    viewRef.current = view
    setEditorView(view) // AI 패널이 선택·본문을 읽고 결과를 삽입할 수 있게 등록
    if (useStore.getState().activePath) view.focus()
    return () => {
      setEditorView(null)
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // 문서 전환 시 내용 교체 + 편집 가능 여부 갱신.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableRef.current.reconfigure(EditorView.editable.of(activePath != null))
    })
    const next = useStore.getState().body
    if (next !== view.state.doc.toString()) {
      syncingRef.current = true
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
      syncingRef.current = false
    }
    if (activePath) view.focus()
  }, [activePath])

  // 전체 검색 점프(§6.9) — 예약된 위치를 선택하고 화면 중앙으로. **위 본문 교체 effect보다 뒤에
  // 선언해야 한다**: 문서 전환과 점프가 같은 커밋에 오면 React가 선언 순서대로 실행하므로,
  // 새 본문이 뷰에 실린 다음에 선택이 찍힌다. store는 본문을 실은 뒤에만 pendingJump를 세운다.
  useEffect(() => {
    const view = viewRef.current
    if (!view || !pendingJump) return
    // 검색 시점과 파일이 달라졌을 수 있으니 문서 길이로 클램프(범위 밖 selection은 예외를 던진다).
    const len = view.state.doc.length
    const from = Math.min(pendingJump.from, len)
    const to = Math.min(pendingJump.to, len)
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' })
    })
    view.focus()
    useStore.getState().clearJump()
  }, [pendingJump])

  return (
    <div className="editor-wrap">
      <div className="editor-host" ref={hostRef} />
      {!activePath && (
        <div className="editor-empty">
          <p>왼쪽 바인더에서 문서를 선택하거나 새로 만드세요.</p>
        </div>
      )}
      {ghost && <GhostBar ghost={ghost} view={viewRef.current} />}
      {!ghost && notice && <NoticeBar text={notice} />}
    </div>
  )
}
