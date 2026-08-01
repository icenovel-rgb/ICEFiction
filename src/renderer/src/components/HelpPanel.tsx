/**
 * 문법·단축키 도움말(BLUEPRINT §8.1) — 상단바 ? 아이콘(또는 F1)으로 연다.
 *
 * 마크다운 표준 문법과 **이 앱만의 규칙**을 한 화면에 버무려 적는다. 둘을 따로 적으면
 * "무엇이 원고 파일에 남고 무엇이 화면 설정인지"가 헷갈린다 — 그래서 남는 것/안 남는 것을
 * 표 안에서 바로 말해 준다.
 *
 * 단축키 표기는 OS에 맞춘다(맥은 ⌘·⇧) — 같은 코드가 윈도우·맥 양쪽에서 도니까.
 */
import { useEffect } from 'react'
import { useHelp } from '../ui/help'

const IS_MAC = navigator.userAgent.includes('Mac')

/** 'B' → 'Ctrl+B' / '⌘B'. shift=true면 Shift를 끼운다. */
function k(base: string, shift = false): string {
  if (IS_MAC) return `⌘${shift ? '⇧' : ''}${base}`
  return `Ctrl+${shift ? 'Shift+' : ''}${base}`
}

interface Row {
  /** 왼쪽 칸 — 키 조합이나 문법 조각. */
  code: string
  desc: string
  /** 원고 파일에 남는 표시(문법)인지, 화면에만 적용되는 설정인지. */
  tag?: '파일' | '화면'
}

interface Section {
  title: string
  intro?: string
  rows: Row[]
}

/** 꼬리표 색 구분용 클래스(CSS 선택자는 ASCII로 둔다 — 한글 클래스는 도구마다 취급이 다르다). */
function tagClass(tag: Row['tag']): string {
  return `help-tag ${tag === '파일' ? 'in-file' : 'in-view'}`
}

const SECTIONS: Section[] = [
  {
    title: '쓰기 — 줄과 문단',
    intro: '문단 사이 간격은 보기 설정으로 벌리니, 엔터를 두 번 칠 필요가 없습니다.',
    rows: [
      { code: 'Enter', desc: '새 문단 — 문단 간격이 붙습니다' },
      {
        code: 'Shift+Enter',
        desc: '줄바꿈 — 문단 간격 없이 줄간격만. 같은 문단의 다음 줄입니다(시·노래·주소처럼 붙여 쓸 때)',
        tag: '파일'
      },
      { code: 'Tab', desc: '들여쓰기 한 칸(전각 공백). Shift+Tab으로 제거', tag: '파일' },
      { code: k('\\'), desc: '집중 모드 — 양쪽 패널 접기' },
      { code: '/', desc: 'AI 명령 — 이어쓰기·다듬기·묘사·대사·줄거리·삽화' },
      { code: k('F'), desc: '이 문서에서 찾기·바꾸기' },
      {
        code: k('F', true),
        desc: '책 전체에서 찾기·모두 바꾸기 — 임시 이름을 진짜 이름으로 한 번에. 바꾸기 직전 원본은 책 폴더의 .backups/에 남습니다(Ctrl+Z로는 못 되돌립니다)'
      },
      { code: k('+') + ' / ' + k('-') + ' / ' + k('0'), desc: '화면 확대·축소·되돌리기' }
    ]
  },
  {
    title: '대사와 따옴표',
    intro: '따옴표를 치면 닫는 짝까지 들어가고 커서가 그 안으로 들어갑니다(보기 설정에서 끌 수 있습니다).',
    rows: [
      { code: '"', desc: '대사 — 치는 순간 ""가 되고 커서는 안쪽. 닫을 때 "를 한 번 더 치면 짝을 건너뜁니다' },
      { code: "'", desc: '생각·인용 — 위와 같습니다' },
      { code: '「 『', desc: '낫표·겹낫표도 짝이 맞습니다' },
      {
        code: 'Enter',
        desc: '대사를 다 썼으면 닫는 따옴표 밖으로 나가 다음 줄을 엽니다 — 닫는 부호를 또 치지 않아도 됩니다(뒤에 글이 남아 있으면 평소대로 줄을 가릅니다)'
      },
      { code: 'Backspace', desc: '빈 짝("") 사이에서 누르면 두 부호가 함께 지워집니다' },
      {
        code: '" vs “ ”',
        desc: '모양이 달라 보이면 글꼴이 아니라 글자가 다른 것입니다 — 자판의 "(U+0022)와 출판용 “ ”(U+201C·U+201D)는 서로 다른 글자입니다. 보기 설정 > 쓰기 도우미 > 따옴표 모양에서 한쪽으로 통일할 수 있습니다',
        tag: '파일'
      },
      {
        code: '연속 대사',
        desc: '보기 설정 — 대사가 이어질 때만 간격을 붙입니다. 서술과 맞닿는 첫 줄·마지막 줄은 벌어진 채로 둡니다',
        tag: '화면'
      }
    ]
  },
  {
    title: '글자 꾸미기',
    rows: [
      { code: k('B'), desc: '굵게 — 원고에는 **굵게**로 기록됩니다', tag: '파일' },
      { code: k('I'), desc: '기울임 — *기울임*', tag: '파일' },
      {
        code: k('U'),
        desc: '밑줄 — 마크다운에 밑줄 문법이 없어 <u>밑줄</u>(표준 HTML)로 기록됩니다',
        tag: '파일'
      },
      { code: '~~취소선~~', desc: '취소선', tag: '파일' },
      { code: '`고정폭`', desc: '고정폭(코드) 글자', tag: '파일' }
    ]
  },
  {
    title: '문단 모양',
    rows: [
      {
        code: '# 제목',
        desc: '큰 제목 — ##, ### 로 소제목. 제목 줄 위에는 문단 간격의 3배만큼 여백이 자동으로 붙습니다',
        tag: '파일'
      },
      { code: '> 인용문', desc: '인용 블록(왼쪽 세로선). 빈 인용 줄에서 Enter를 누르면 빠져나옵니다', tag: '파일' },
      {
        code: '--',
        desc: '줄 앞에서 - 를 두 번 치면 불릿(• )으로 바뀝니다. 문장 속 줄표(--)는 그대로 둡니다',
        tag: '파일'
      },
      { code: '---', desc: '- 를 세 번 치면 가로 구분선(장면 전환)', tag: '파일' },
      {
        code: k('L', true) + ' / ' + k('E', true) + ' / ' + k('R', true) + ' / ' + k('J', true),
        desc: '고른 문단만 왼쪽·가운데·오른쪽·양쪽 정렬 (해제는 ' + k('0', true) + ')',
        tag: '파일'
      },
      {
        code: '문단 간격 · 첫 줄',
        desc: '보기 설정 — 문단 간격, 들여쓰기·내어쓰기, 글꼴·글자 크기·줄 간격. 원고 파일에는 공백이 들어가지 않습니다',
        tag: '화면'
      }
    ]
  },
  {
    title: '넣기',
    rows: [
      { code: '![](경로)', desc: '이미지 — 자료를 본문으로 끌어놓으면 자동으로 들어갑니다', tag: '파일' },
      { code: '[글자](주소)', desc: '링크', tag: '파일' },
      { code: '[[열람: 경로]]', desc: 'AI에게 특정 파일을 읽어 달라고 할 때 쓰는 표시' }
    ]
  }
]

/** 헷갈리기 쉬운 지점만 따로 못 박는다 — 실제로 사용자가 걸려 넘어진 것들. */
const GOTCHAS: string[] = [
  '`- ` 하나로는 목록이 되지 않습니다. 소설에서 줄표를 자주 쓰기 때문에 일부러 그대로 둡니다 — 불릿은 `--`(두 번)입니다.',
  '들여쓰기는 탭 문자나 공백 네 칸이 아니라 **전각 공백**으로 넣습니다. 탭·네 칸 공백은 마크다운에서 코드 블록이 되기 때문입니다.',
  '커서가 없는 줄은 기호(#, **, <u>)가 숨겨져 결과처럼 보입니다. 고치려면 그 줄을 클릭하세요.',
  '원고는 표준 마크다운(.md)으로 저장됩니다 — 옵시디언·워드·깃허브에서 그대로 열립니다.'
]

/** `**굵게**` 처럼 백틱으로 감싼 부분을 <code>로 그린다(도움말 문장 안 강조). */
function richText(text: string): React.ReactNode {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i}>{part.slice(1, -1)}</code>
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <b key={i}>{part.slice(2, -2)}</b>
    }
    return part
  })
}

export function HelpPanel(): React.ReactElement | null {
  const open = useHelp((s) => s.open)
  const hide = useHelp((s) => s.hide)

  // Esc로 닫기 — 창이 떠 있을 때만 듣는다(다른 Esc 동작을 가리지 않게).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        hide()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, hide])

  if (!open) return null

  return (
    <div className="modal-backdrop help-backdrop" onClick={hide}>
      <div className="help-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="문법 도움말">
        <header className="help-head">
          <span className="help-title">문법·단축키 도움말</span>
          <span className="help-legend">
            <span className="help-tag in-file">파일</span> 원고에 기록됨
            <span className="help-tag in-view">화면</span> 보기 설정(파일에 안 남음)
          </span>
          <button className="help-x" onClick={hide} title="닫기 (Esc)">
            ✕
          </button>
        </header>

        <div className="help-body">
          {SECTIONS.map((sec) => (
            <section className="help-sec" key={sec.title}>
              <h3>{sec.title}</h3>
              {sec.intro && <p className="help-intro">{sec.intro}</p>}
              <table>
                <tbody>
                  {sec.rows.map((r) => (
                    <tr key={r.code + r.desc}>
                      <td>
                        <code>{r.code}</code>
                      </td>
                      <td>
                        {r.desc}
                        {r.tag && <span className={tagClass(r.tag)}>{r.tag}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          <section className="help-sec help-gotchas">
            <h3>헷갈리기 쉬운 것</h3>
            <ul>
              {GOTCHAS.map((g) => (
                <li key={g}>{richText(g)}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
