/**
 * 문체 분석 프롬프트 — style/samples/의 기존 원고에서 '문체지침'을 뽑아내는 지시문(BLUEPRINT §7.2a).
 *
 * 왜 지침을 따로 뽑는가: 샘플 원고를 매 요청에 통째로 싣는 것은 비싸고, 모델이 문체 대신 **줄거리**를
 * 따라가 버린다(실측되는 흔한 실패). 샘플에서 규칙을 한 번 추출해 짧은 지침으로 굳혀 두면,
 * 그 지침만 매 요청 맨 앞에 실어도 문체가 유지된다 — 옷본을 떠 두는 것과 같다.
 *
 * 이 파일은 순수 함수만 담는다 — 그대로 단위 테스트한다.
 */

export interface StyleSample {
  /** 표시용 이름(파일명) */
  name: string
  /** 원고 본문 */
  text: string
}

/** 분석에 넣을 샘플 총량 상한(글자). 넘으면 앞에서부터 잘라 담는다. */
export const STYLE_ANALYSIS_CAP = 12000
/** 샘플 한 편이 차지할 수 있는 최대 글자 — 한 편이 예산을 다 먹는 것을 막는다. */
export const STYLE_ANALYSIS_EACH = 4000

/** 지침에 들어갈 항목(문체지침.md 씨앗의 제목과 같은 순서·이름). */
export const STYLE_SECTIONS = ['시점·인칭', '문장', '어미·말투', '대사', '묘사', '피할 것'] as const

/** 예산 안에서 샘플을 발췌한다. 각 편 상한 → 전체 상한 순으로 자른다. */
export function clipSamples(
  samples: StyleSample[],
  cap = STYLE_ANALYSIS_CAP,
  each = STYLE_ANALYSIS_EACH
): StyleSample[] {
  const out: StyleSample[] = []
  let budget = cap
  for (const s of samples) {
    if (budget <= 0) break
    const text = s.text.trim().slice(0, Math.min(each, budget))
    if (!text) continue
    budget -= Array.from(text).length
    out.push({ name: s.name, text })
  }
  return out
}

/**
 * 문체 분석 지시문을 만든다. 결과는 **문체지침.md에 그대로 넣을 수 있는 마크다운**이어야 한다
 * (머리말·설명·코드펜스 금지 — 그대로 파일이 되기 때문).
 */
export function buildStyleAnalysisPrompt(samples: StyleSample[]): string {
  const clipped = clipSamples(samples)
  const body = clipped
    .map((s) => `### 참고 원고: ${s.name}\n${s.text}`)
    .join('\n\n')

  return [
    '아래는 이 작가가 실제로 쓴 원고입니다. 이 글들의 **문체**를 분석해, 앞으로 AI가 같은 문체로',
    '쓰도록 지시하는 "문체지침"을 작성하세요.',
    '',
    '규칙:',
    `· 다음 항목을 이 순서의 마크다운 제목(##)으로 만드세요 — ${STYLE_SECTIONS.join(' / ')}`,
    '· 각 항목은 2~5줄. 관찰이 아니라 **지시문**으로 쓰세요("~한다", "~하지 않는다").',
    '· 가능하면 수치로 못박으세요(예: 한 문장 평균 40자, 한 문단 3~5문장).',
    '· 줄거리·인물 이름·설정은 절대 쓰지 마세요. 문체 규칙만 씁니다.',
    '· 머리말·맺음말·설명·코드펜스 없이 마크다운 본문만 출력하세요(그대로 파일로 저장됩니다).',
    '',
    body
  ].join('\n')
}
