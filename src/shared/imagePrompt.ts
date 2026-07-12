/**
 * 이미지 생성 프롬프트 조립 — CLI 에이전트(agy·codex·gemini)에게 넘길 지시문(BLUEPRINT §7.6).
 *
 * 실측으로 알아낸 규칙 두 가지가 이 파일의 존재 이유다.
 *
 *  ① **"book cover" / "title" 같은 말을 쓰면 모델이 가짜 글자를 그려 넣는다.**
 *     실제로 "NO text"라고 못박아도, 프롬프트에 book cover가 있으면 "A NETVEL GON" 같은
 *     엉터리 영문 제목을 렌더했다. 표지용 프롬프트는 **"세로 일러스트"** 로 표현하고 강한
 *     no-writing 제약을 건다. 그러면 글자가 사라진다(검증됨).
 *  ② **모델은 한글을 못 쓴다.** 제목은 AI에게 맡기지 않고 앱이 내장 글꼴로 얹는다.
 *     그래서 그림은 "제목 들어갈 자리(상단)를 비워둔" 채로 생성한다.
 *
 * 이 파일은 순수 함수만 담는다 — 그대로 단위 테스트한다.
 */

export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024'

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
  size: ImageSize
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
  const lines: string[] = [
    'You have an image generation tool. Generate ONE image and save it as a PNG file.',
    '',
    'Destination (save the final PNG to this EXACT absolute path):',
    input.destAbsPath,
    '',
    `Output size: ${input.size}`,
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
