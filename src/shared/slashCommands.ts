/**
 * 본문 슬래시 명령(BLUEPRINT §6.1b) — 본문에서 `/`를 치면 AI 기능이 그 자리에서 뜬다.
 *
 * 패널로 시선을 옮기지 않고 쓰던 자리에서 바로 부르는 것이 요점이다. 결과는 고스트 텍스트(§6.1a)로
 * 흐리게 미리 보이고, Tab을 눌러야 원고에 들어간다(§7.4 — AI는 원고를 직접 고치지 않는다).
 *
 * 프롬프트 조립은 순수 함수다 — 그대로 단위 테스트한다.
 */
import { hasSoftBreak } from './paraGap'

export type SlashKind = 'ghost' | 'synopsis' | 'image'

export interface SlashContext {
  /** 커서 앞 본문(끝부분) — 무엇을 이어 쓸지 판단할 근거 */
  before: string
  /** 선택 영역(없으면 빈 문자열) */
  selection: string
  /** 현재 문서 제목(표시용) */
  title: string
  /** 작가가 그 자리에서 덧붙인 한 줄 지시(비어 있을 수 있다 — §6.1b). */
  instruction?: string
}

/** 명령을 고른 뒤 한 줄 지시를 받는 입력 막대의 문구. */
export interface SlashAsk {
  /** 입력 막대에 뜨는 물음 */
  title: string
  /** 입력칸 안내 문구(예시) */
  placeholder: string
}

export interface SlashCommand {
  id: string
  /** 자동완성 목록에 뜨는 이름 — 사용자가 `/이어`까지만 쳐도 걸린다 */
  label: string
  /** 목록 오른쪽 설명 */
  detail: string
  /** 목록 왼쪽 아이콘 — 여섯 줄을 눈으로 훑을 때 종류를 먼저 알아보게 한다 */
  icon: string
  /**
   * 고른 뒤 결과가 **어디로 가는지**(목록 오른쪽 꼬리표).
   * 고르기 전에 "Tab을 눌러야 원고에 들어간다"를 알려 주는 자리다 — 슬래시 명령의 핵심 약속(§7.4).
   */
  outcome: string
  kind: SlashKind
  /**
   * 대상을 결과로 **갈아끼우는** 명령인가. `/`를 치는 순간 선택이 지워지므로(에디터 기본 동작),
   * 대상은 커서가 놓인 **문단 하나**다(= 그 줄 — `paragraphAt`). 원고 전체가 아니다.
   */
  replaces?: boolean
  /**
   * 실행 전에 작가에게 한 줄 지시를 받는다(§6.1b). 비워 두고 Enter면 지시 없이 그대로 실행한다 —
   * "넣을 수도 있고 넣지 않을 수도 있게"가 요점이라 **입력을 강제하지 않는다**.
   */
  ask?: SlashAsk
  /** AI에 보낼 지시문(image는 쓰지 않는다) */
  build?: (ctx: SlashContext) => string
}

/** 그 자리가 속한 줄의 시작 오프셋. */
function lineStartAt(doc: string, pos: number): number {
  if (pos <= 0) return 0
  const nl = doc.lastIndexOf('\n', pos - 1)
  return nl < 0 ? 0 : nl + 1
}

/** 그 자리가 속한 줄의 끝 오프셋(줄바꿈 앞). */
function lineEndAt(doc: string, pos: number): number {
  const nl = doc.indexOf('\n', pos)
  return nl < 0 ? doc.length : nl
}

/**
 * 커서가 놓인 **문단**의 범위. 빈 줄이면 null.
 *
 * 이 앱에서 한 문단은 **한 줄**이다(§8.1) — 문단 사이를 빈 줄로 벌리지 않고 줄 아래 여백
 * (`--paper-para-gap`)으로 벌린다. AI가 준 글도 빈 줄을 걷어내 넣는다(`collapseBlankLines`).
 *
 * ⚠️ 예전에는 **빈 줄(`\n\n`) 사이 덩어리**를 문단으로 잡았다. 그런데 이 앱 원고에는 빈 줄이
 *   아예 없으므로 그 덩어리가 곧 **문서 전체**였다 — `/다듬기`를 부르면 한 문단이 아니라 원고를
 *   통째로 다시 쓰고 앉아 있었다(사용자 신고). 화면에서 한 문단으로 보이는 것을 그대로 잡는다.
 *
 * Shift+Enter로 이어 붙인 줄(줄 끝 공백 두 칸 = 하드 브레이크)은 **같은 문단**이므로 함께 담는다 —
 * 눈에 한 덩이로 보이는 것이 한 문단이라는 규칙을 여기서도 지킨다.
 */
export function paragraphAt(doc: string, pos: number): { from: number; to: number } | null {
  const text = doc ?? ''
  const p = Math.max(0, Math.min(pos, text.length))
  let from = lineStartAt(text, p)
  let to = lineEndAt(text, p)
  if (!text.slice(from, to).trim()) return null // 빈 줄 — 엉뚱한 문단을 고치지 않는다

  // 위로: 앞 줄이 Shift+Enter로 끝났으면 이 줄은 그 문단의 뒷줄이다.
  while (from > 0) {
    const prevFrom = lineStartAt(text, from - 1)
    if (!hasSoftBreak(text.slice(prevFrom, from - 1))) break
    from = prevFrom
  }
  // 아래로: 이 줄이 Shift+Enter로 끝났으면 다음 줄까지 한 문단이다(빈 줄에서는 멈춘다).
  while (to < text.length && hasSoftBreak(text.slice(lineStartAt(text, to), to))) {
    const next = lineEndAt(text, to + 1)
    if (!text.slice(to + 1, next).trim()) break
    to = next
  }
  return { from, to }
}

/** 커서 앞 본문을 얼마나 보여 줄지 — 맥락(§7.2)이 전체를 이미 담으므로 여기선 직전 흐름만. */
export const BEFORE_CAP = 1200

const PLAIN =
  '설명·머리말·따옴표·마크다운 표시 없이, 원고에 그대로 이어붙일 **본문만** 출력하세요.'

/**
 * 작가가 덧붙인 한 줄 지시를 요청문 **맨 끝**에 붙인다 — 실제 과제 바로 옆에 둬야 모델이 흘리지 않는다.
 * 지시가 비어 있으면 아무것도 붙이지 않는다(없는 요구를 지어내게 만들지 않기 위해).
 * 문체 지침은 여전히 최우선이다(§7.2a) — 지시는 '무엇을 쓸지'이지 '어떤 문체로 쓸지'가 아니다.
 */
export function withInstruction(prompt: string, instruction?: string): string {
  const t = (instruction ?? '').trim()
  if (!t) return prompt
  return `${prompt}\n\n[작가 지시 — 이 내용대로 쓸 것(문체 지침은 그대로 지킨다)]\n${t}`
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'continue',
    label: '/이어쓰기',
    detail: '이 자리에서 다음 문단을 이어 씁니다',
    icon: '✍',
    outcome: 'Tab 확정',
    kind: 'ghost',
    ask: { title: '어떻게 이어쓸까요?', placeholder: '예: 비가 그치고 형사가 돌아온다' },
    build: (c) =>
      withInstruction(
        `아래는 지금 쓰고 있는 원고의 커서 직전 부분입니다. 여기서 자연스럽게 이어서 2~4문단을 쓰세요.\n${PLAIN}\n\n[커서 직전]\n${c.before}`,
        c.instruction
      )
  },
  {
    id: 'polish',
    label: '/다듬기',
    detail: '커서가 놓인 문단 하나만 윤문합니다',
    icon: '✨',
    outcome: 'Tab 확정',
    kind: 'ghost',
    replaces: true,
    ask: { title: '어떻게 다듬을까요?', placeholder: '예: 더 짧고 건조하게' },
    build: (c) =>
      withInstruction(
        `다음 부분을 다듬어 주세요. 뜻과 사건은 그대로 두고 문장만 자연스럽게 고칩니다.\n${PLAIN}\n\n[원문]\n${c.selection}`,
        c.instruction
      )
  },
  {
    id: 'describe',
    label: '/묘사',
    detail: '이 장면의 감각 묘사를 보탭니다',
    icon: '🌿',
    outcome: 'Tab 확정',
    kind: 'ghost',
    ask: { title: '무엇을 묘사할까요?', placeholder: '예: 골목의 냄새와 빗소리' },
    build: (c) =>
      withInstruction(
        `아래 장면에 이어질 묘사를 1~2문단 쓰세요. 소리·냄새·촉감 중 하나는 반드시 넣고, 인물의 감정을 직접 말하지 말고 행동과 배경으로 드러내세요.\n${PLAIN}\n\n[커서 직전]\n${c.selection || c.before}`,
        c.instruction
      )
  },
  {
    id: 'dialogue',
    label: '/대사',
    detail: '이 상황에 맞는 대사를 제안합니다',
    icon: '💬',
    outcome: 'Tab 확정',
    kind: 'ghost',
    ask: { title: '어떤 대사를 원하나요?', placeholder: '예: 서로 속내를 숨기는 대화' },
    build: (c) =>
      withInstruction(
        `아래 상황에 이어질 인물들의 대사를 쓰세요. 큰따옴표를 쓰고, 대사 사이 지문은 짧게. 인물의 말투는 맥락의 인물 시트를 따르세요.\n${PLAIN}\n\n[커서 직전]\n${c.selection || c.before}`,
        c.instruction
      )
  },
  {
    id: 'synopsis',
    label: '/줄거리',
    detail: '이 장면의 줄거리 한 줄을 만듭니다',
    icon: '📌',
    outcome: '문서 정보로',
    kind: 'synopsis',
    build: () =>
      '지금 열려 있는 장면(맥락의 "현재 장면")의 줄거리를 한 문장으로 요약하세요. 40자 안팎, 마침표 없이, 사건 중심으로. 설명 없이 그 한 문장만 출력하세요.'
  },
  {
    id: 'image',
    label: '/삽화',
    detail: '이 자리에 넣을 그림을 AI로 그립니다',
    icon: '🎨',
    outcome: '그림 창 열기',
    kind: 'image'
  }
]

/** 입력한 글자로 명령을 찾는다(자동완성이 걸러 주지만, 테스트·직접 호출용). */
export function findCommand(id: string): SlashCommand | undefined {
  return SLASH_COMMANDS.find((c) => c.id === id)
}

/** 커서 앞 본문을 상한만큼 잘라 맥락으로 쓴다. */
export function beforeText(doc: string, cursor: number, cap = BEFORE_CAP): string {
  return doc.slice(Math.max(0, cursor - cap), cursor)
}
