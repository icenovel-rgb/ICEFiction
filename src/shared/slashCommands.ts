/**
 * 본문 슬래시 명령(BLUEPRINT §6.1b) — 본문에서 `/`를 치면 AI 기능이 그 자리에서 뜬다.
 *
 * 패널로 시선을 옮기지 않고 쓰던 자리에서 바로 부르는 것이 요점이다. 결과는 고스트 텍스트(§6.1a)로
 * 흐리게 미리 보이고, Tab을 눌러야 원고에 들어간다(§7.4 — AI는 원고를 직접 고치지 않는다).
 *
 * 프롬프트 조립은 순수 함수다 — 그대로 단위 테스트한다.
 */

export type SlashKind = 'ghost' | 'synopsis' | 'image'

export interface SlashContext {
  /** 커서 앞 본문(끝부분) — 무엇을 이어 쓸지 판단할 근거 */
  before: string
  /** 선택 영역(없으면 빈 문자열) */
  selection: string
  /** 현재 문서 제목(표시용) */
  title: string
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
   * 대상(선택 영역 또는 커서가 놓인 문단)을 결과로 **갈아끼우는** 명령인가.
   * `/`를 치는 순간 선택이 지워지므로(에디터 기본 동작), 대상은 커서가 있는 문단으로 잡는다.
   */
  replaces?: boolean
  /** AI에 보낼 지시문(image는 쓰지 않는다) */
  build?: (ctx: SlashContext) => string
}

/** 커서가 놓인 문단(빈 줄 사이 덩어리)의 범위. 없으면 null. */
export function paragraphAt(doc: string, pos: number): { from: number; to: number } | null {
  const before = doc.lastIndexOf('\n\n', Math.max(0, pos - 1))
  const after = doc.indexOf('\n\n', pos)
  const from = before < 0 ? 0 : before + 2
  const to = after < 0 ? doc.length : after
  if (to <= from) return null
  return doc.slice(from, to).trim() ? { from, to } : null
}

/** 커서 앞 본문을 얼마나 보여 줄지 — 맥락(§7.2)이 전체를 이미 담으므로 여기선 직전 흐름만. */
export const BEFORE_CAP = 1200

const PLAIN =
  '설명·머리말·따옴표·마크다운 표시 없이, 원고에 그대로 이어붙일 **본문만** 출력하세요.'

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'continue',
    label: '/이어쓰기',
    detail: '이 자리에서 다음 문단을 이어 씁니다',
    icon: '✍',
    outcome: 'Tab 확정',
    kind: 'ghost',
    build: (c) =>
      `아래는 지금 쓰고 있는 원고의 커서 직전 부분입니다. 여기서 자연스럽게 이어서 2~4문단을 쓰세요.\n${PLAIN}\n\n[커서 직전]\n${c.before}`
  },
  {
    id: 'polish',
    label: '/다듬기',
    detail: '커서가 놓인 문단을 윤문합니다',
    icon: '✨',
    outcome: 'Tab 확정',
    kind: 'ghost',
    replaces: true,
    build: (c) =>
      `다음 부분을 다듬어 주세요. 뜻과 사건은 그대로 두고 문장만 자연스럽게 고칩니다.\n${PLAIN}\n\n[원문]\n${c.selection}`
  },
  {
    id: 'describe',
    label: '/묘사',
    detail: '이 장면의 감각 묘사를 보탭니다',
    icon: '🌿',
    outcome: 'Tab 확정',
    kind: 'ghost',
    build: (c) =>
      `아래 장면에 이어질 묘사를 1~2문단 쓰세요. 소리·냄새·촉감 중 하나는 반드시 넣고, 인물의 감정을 직접 말하지 말고 행동과 배경으로 드러내세요.\n${PLAIN}\n\n[커서 직전]\n${c.selection || c.before}`
  },
  {
    id: 'dialogue',
    label: '/대사',
    detail: '이 상황에 맞는 대사를 제안합니다',
    icon: '💬',
    outcome: 'Tab 확정',
    kind: 'ghost',
    build: (c) =>
      `아래 상황에 이어질 인물들의 대사를 쓰세요. 큰따옴표를 쓰고, 대사 사이 지문은 짧게. 인물의 말투는 맥락의 인물 시트를 따르세요.\n${PLAIN}\n\n[커서 직전]\n${c.selection || c.before}`
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
