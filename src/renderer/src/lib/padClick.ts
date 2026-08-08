/**
 * 원고 아래 여백 클릭(BLUEPRINT §8.2) — 빈 여백을 눌러도 커서가 원고 끝으로 간다.
 *
 * 문제(사용자 신고): 아래 여백(기본 화면 높이의 30%)을 클릭하면 **아무 일도 일어나지 않는다.**
 * 그 여백은 `.cm-scroller`의 padding이라 편집 영역(`.cm-content`) 밖이고, 편집 불가능한 자리를
 * 누른 셈이라 포커스가 빠지면서 커서까지 사라진다. 글을 쓰다 여백을 한 번 누르면 글자 위를 다시
 * 찾아 클릭해야 했다.
 *
 * 종이에 비유하면 이렇다. 원고지 아래쪽 빈칸에 펜을 갖다 댔는데 아무 데도 안 써지고, 마지막
 * 글자를 손가락으로 다시 짚어야 이어 쓸 수 있는 상태였다.
 *
 * 고침: 글 아래 빈 자리를 누르면 **커서를 원고 맨 끝에 놓고** 에디터에 포커스를 준다. 워드·옵시디언
 * 같은 편집기와 같은 감각이다(빈 여백을 누르면 가장 가까운 글자 자리로 간다).
 *
 * 배선 메모: `EditorView.domEventHandlers`는 **`.cm-content`에만** 붙는다(CM6 문서). 여백은 그
 * 밖이라 그 통로로는 이벤트가 오지 않는다 → 스크롤 요소에 직접 붙이는 ViewPlugin으로 만든다.
 */
import { EditorView, ViewPlugin } from '@codemirror/view'

export const padClickToEnd = ViewPlugin.define((view: EditorView) => {
  const onMouseDown = (event: MouseEvent): void => {
    // 왼쪽 단추만. mac의 **Ctrl+클릭은 보조 클릭**(오른쪽 단추)이라 button이 0으로 와도 넘긴다 —
    // 안 그러면 맥에서 여백을 Ctrl+클릭할 때 메뉴 대신 커서가 움직인다.
    if (event.button !== 0 || event.ctrlKey) return
    if (!view.state.facet(EditorView.editable)) return // 문서가 안 열렸거나 읽기 전용
    const target = event.target as Node | null
    if (target && view.contentDOM.contains(target)) return // 글자 위 클릭은 CM6가 알아서 한다
    // 글 **아래** 빈 자리만 — 좌우 여백은 그대로 둔다(그 줄로 가려는 것인지 알 수 없다).
    if (event.clientY <= view.contentDOM.getBoundingClientRect().bottom) return

    // 기본 동작(편집 불가능한 자리를 눌러 포커스가 빠지는 것)을 막고 우리가 커서를 놓는다.
    event.preventDefault()
    const end = view.state.doc.length
    if (view.state.selection.main.head !== end || !view.state.selection.main.empty) {
      view.dispatch({ selection: { anchor: end }, userEvent: 'select.pointer' })
    }
    view.focus()
  }

  view.scrollDOM.addEventListener('mousedown', onMouseDown)
  return {
    destroy(): void {
      view.scrollDOM.removeEventListener('mousedown', onMouseDown)
    }
  }
})
