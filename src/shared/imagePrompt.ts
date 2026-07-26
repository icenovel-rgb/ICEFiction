/**
 * 이미지 생성 프롬프트 조립 — CLI 에이전트(agy·codex·gemini)에게 넘길 지시문(BLUEPRINT §7.6).
 *
 * 실측으로 알아낸 규칙 두 가지가 이 파일의 존재 이유다.
 *
 *  ① **"book cover" / "title" 같은 말을 쓰면 모델이 가짜 글자를 그려 넣는다.**
 *     실제로 "NO text"라고 못박아도, 프롬프트에 book cover가 있으면 "A NETVEL GON" 같은
 *     엉터리 영문 제목을 렌더했다. 표지용 프롬프트는 **"세로 일러스트"** 로 표현하고 강한
 *     no-writing 제약을 건다. 그러면 글자가 사라진다(검증됨).
 *  ② **제목은 AI에게 맡기지 않고 앱이 내장 글꼴로 얹는다.** 모델이 글자를 렌더할 수 있느냐와
 *     별개로, 그림에 구워진 제목은 **글꼴·크기·위치를 못 고치고, 한 글자만 바꾸려 해도 그림을
 *     통째로 다시 그려야 한다**(한 장에 1분 이상). 그림과 활자를 분리하면 재생성 없이 즉시
 *     다시 조판할 수 있고 ①의 엉터리 글자 위험도 원천 차단된다.
 *     그래서 그림은 "제목 들어갈 자리(상단)를 비워둔" 채로 생성한다.
 *
 * 이 파일은 순수 함수만 담는다 — 그대로 단위 테스트한다.
 */

/**
 * 삽화 비율(§7.6). 엔진이 실제로 만들어 주는 크기는 셋뿐인 경우가 많으므로(gpt-image: 1:1·2:3·3:2),
 * **요청 크기(request)** 와 **최종 크기(target)** 를 나눠 둔다. 엔진이 비율을 지원하면 그대로 나오고,
 * 못 맞추면 앱이 중앙을 기준으로 잘라 정확한 비율을 만든다(image.ts cropToRatio).
 *
 * 사진을 인화할 때 원판보다 좁은 액자에 맞춰 가장자리를 조금 잘라 내는 것과 같다.
 */
export type AspectRatio = '1:1' | '3:2' | '2:3' | '4:3' | '3:4' | '16:9' | '9:16'

export interface AspectSpec {
  /** 드롭다운 표시 이름 */
  label: string
  /** 최종 결과 크기(이 비율이 되도록 필요하면 잘라낸다) */
  target: { w: number; h: number }
  /** 엔진에 요청할 크기 — 엔진이 확실히 만드는 세 가지 중 가장 가까운 것 */
  request: { w: number; h: number }
}

const SQUARE = { w: 1024, h: 1024 }
const LAND = { w: 1536, h: 1024 }
const PORT = { w: 1024, h: 1536 }

export const ASPECTS: Record<AspectRatio, AspectSpec> = {
  '1:1': { label: '1:1 정사각 (인물·아이콘)', target: SQUARE, request: SQUARE },
  '3:2': { label: '3:2 가로 (기본 가로)', target: LAND, request: LAND },
  '2:3': { label: '2:3 세로 (책 표지)', target: PORT, request: PORT },
  '4:3': { label: '4:3 가로 (고전 화면)', target: { w: 1365, h: 1024 }, request: LAND },
  '3:4': { label: '3:4 세로 (인물 전신)', target: { w: 1024, h: 1365 }, request: PORT },
  '16:9': { label: '16:9 와이드 (영상·배너)', target: { w: 1536, h: 864 }, request: LAND },
  '9:16': { label: '9:16 세로 (쇼츠·모바일)', target: { w: 864, h: 1536 }, request: PORT }
}

export const ASPECT_KEYS = Object.keys(ASPECTS) as AspectRatio[]

/** 알 수 없는 값이 와도 안전하게(옛 설정·수기 편집 대비). */
export function aspectOf(ratio: string | undefined): AspectRatio {
  return ratio && ratio in ASPECTS ? (ratio as AspectRatio) : '1:1'
}

/**
 * 실제 이미지 크기를 목표 비율로 자를 사각형(중앙 기준). 이미 비율이 맞으면 null.
 * 허용 오차 2% — 엔진이 1536×864 대신 1536×866을 줘도 굳이 자르지 않는다(화질 손실 방지).
 */
export function cropRect(
  actual: { w: number; h: number },
  ratio: AspectRatio,
  tolerance = 0.02
): { x: number; y: number; width: number; height: number } | null {
  const { target } = ASPECTS[ratio]
  const want = target.w / target.h
  if (actual.w <= 0 || actual.h <= 0) return null
  const have = actual.w / actual.h
  if (Math.abs(have - want) / want <= tolerance) return null
  if (have > want) {
    const width = Math.round(actual.h * want)
    return { x: Math.round((actual.w - width) / 2), y: 0, width, height: actual.h }
  }
  const height = Math.round(actual.w / want)
  return { x: 0, y: Math.round((actual.h - height) / 2), width: actual.w, height }
}

/** 어떤 이미지든 반드시 붙는 "글자 금지" 제약. 위 ①의 방어선이다. */
export const NO_TEXT_CONSTRAINT = [
  'CRITICAL CONSTRAINT — the image must contain ABSOLUTELY NO WRITING of any kind:',
  'no text, no letters, no words, no numbers, no typography, no captions, no titles,',
  'no signage, no shop signs, no billboards, no license plates, no watermark, no logo,',
  'no signature. Every surface that would normally carry writing must be blank.',
  'If you are about to render any glyph or character, do not.'
].join('\n')

/** 표지 아트의 구도 지시 — 제목이 앉을 상단을 비워둔다(제목은 앱이 얹는다). */
const COVER_COMPOSITION =
  'Composition: keep the upper third of the frame visually calm and uncluttered (open sky, fog, or plain surface), with the main subject in the lower two thirds.'

/**
 * 표지 프롬프트에서 **긍정 서술로 쓰면 안 되는** 낱말.
 *
 * "Book cover for a novel…"처럼 긍정으로 쓰면 모델이 가짜 제목을 그린다(실측).
 * 반대로 "NOT a poster, NOT a book cover"처럼 **부정으로 못박는 건 안전하고, 실제로 성공한
 * 프롬프트에 들어 있었다.** 그래서 낱말 자체를 금지하지 않고 '긍정 사용'만 잡는다.
 */
export const FORBIDDEN_COVER_WORDS = ['book cover', 'cover art', 'poster', 'title', 'typography']

/** 금지 낱말이 긍정 서술로 쓰였으면 그 낱말을, 아니면 null. (앞에 not/no가 붙으면 부정으로 본다) */
export function positiveForbiddenWord(prompt: string): string | null {
  const low = prompt.toLowerCase()
  for (const w of FORBIDDEN_COVER_WORDS) {
    let i = low.indexOf(w)
    while (i >= 0) {
      const before = low.slice(Math.max(0, i - 14), i)
      const negated = /\b(not|no)\s+(a|an|any)?\s*$/.test(before)
      if (!negated) return w
      i = low.indexOf(w, i + w.length)
    }
  }
  return null
}

export interface DocPromptInput {
  /** 문서 제목(인물 이름 등) */
  name: string
  /** 문서 종류 — 프롬프트 도입부를 고른다 */
  type?: string
  /** 시놉시스·한 줄 요약 */
  synopsis?: string
  /** 본문에서 뽑은 묘사(앞부분) */
  body?: string
  /** 별칭·호칭 */
  aliases?: string[]
}

/** 문서(캐릭터·장소·장면) 이미지의 장면 프롬프트 초안. 사용자가 모달에서 고쳐 쓴다. */
export function draftDocPrompt(input: DocPromptInput): string {
  const isCharacter = input.type === 'character'
  const lead = isCharacter
    ? `Character portrait (head and shoulders) of ${input.name}.`
    : `Atmospheric illustration of ${input.name}.`

  const parts: string[] = [lead]
  if (input.synopsis?.trim()) parts.push(input.synopsis.trim())
  const body = (input.body ?? '').trim()
  if (body) parts.push(body.slice(0, 600))
  if (isCharacter) {
    parts.push(
      'Photorealistic, cinematic lighting, shallow depth of field. Face clearly visible.'
    )
  }
  return parts.join('\n')
}

/**
 * 표지 아트의 장면 프롬프트 초안.
 * ⚠️ 제목·책·포스터라는 말을 쓰지 않는다(위 ①). 대신 "세로 일러스트"로 표현한다.
 */
export function draftCoverPrompt(bookTitle: string, hint?: string): string {
  const parts = [
    // 부정으로 못박는 표현은 실제로 글자를 없앤 프롬프트 그대로다(위 ①). 긍정 서술로 바꾸지 말 것.
    'A vertical cinematic ILLUSTRATION (wallpaper art, NOT a poster, NOT a book cover).',
    hint?.trim()
      ? hint.trim()
      : `An evocative scene that captures the mood of a Korean novel called 「${bookTitle}」. Symbolic, atmospheric.`,
    'Painterly realism, rich lighting, strong mood.'
  ]
  return parts.join('\n')
}

export interface InstructionInput {
  /** 생성 파일이 저장될 **절대경로**(플랫폼 그대로). 에이전트가 여기에 PNG를 쓴다. */
  destAbsPath: string
  ratio: AspectRatio
  /** 장면 프롬프트(위 draft* 결과를 사용자가 수정한 것) */
  prompt: string
  /** 프로젝트 공통 스타일 바이블 — 모든 그림의 화풍을 맞춘다 */
  style?: string
  /** 추가 금지 요소 */
  negative?: string
  /** 표지용이면 상단을 비우는 구도 지시를 넣는다 */
  cover?: boolean
}

/**
 * CLI 에이전트에게 넘길 **지시문 파일 내용**을 만든다.
 *
 * 프롬프트를 argv로 넘기지 않고 파일로 넘기는 이유: Windows에서 cmd.exe를 거치면 줄바꿈이 든
 * 인자가 깨지고 8191자 제한에 걸린다(실측). CLI에는 "이 파일을 읽고 그대로 하라"는 한 줄만 준다.
 */
export function buildInstruction(input: InstructionInput): string {
  const { target, request } = ASPECTS[aspectOf(input.ratio)]
  const lines: string[] = [
    'You have an image generation tool. Generate ONE image and save it as a PNG file.',
    '',
    'Destination (save the final PNG to this EXACT absolute path):',
    input.destAbsPath,
    '',
    // 비율을 먼저 못박고, 그 비율이 안 되는 모델을 위해 대체 크기까지 알려 준다(앱이 잘라 맞춘다).
    `Aspect ratio: ${input.ratio} — output size ${target.w}x${target.h}.`,
    `If your tool cannot produce that exact size, use ${request.w}x${request.h} and keep the subject centered.`,
    '',
    'Image prompt:',
    input.prompt.trim()
  ]
  if (input.cover) lines.push('', COVER_COMPOSITION)
  if (input.style?.trim()) {
    lines.push('', 'Style bible (keep every image in this project consistent with it):', input.style.trim())
  }
  lines.push('', NO_TEXT_CONSTRAINT)
  if (input.negative?.trim()) lines.push('', `Also avoid: ${input.negative.trim()}`)
  lines.push(
    '',
    'Do not ask questions. Do not explain. After the PNG is saved, print exactly this line and nothing else:',
    `${input.destAbsPath} => EXISTS`
  )
  return lines.join('\n')
}

/** CLI에 argv로 넘기는 **한 줄짜리** 프롬프트(줄바꿈 금지 — cmd.exe에서 깨진다). */
export function oneLinePrompt(instructionFileAbs: string): string {
  return `Read the file ${instructionFileAbs} and follow its instructions exactly. Do not ask questions.`
}
