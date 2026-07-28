/**
 * 표지 조판 — 그림 위에 제목을 얹어 <canvas>에 그린다(BLUEPRINT §7.6).
 *
 * 책 표지와 챕터 표지가 **같은 함수 하나**를 쓴다. 규칙도 하나다:
 * **AI는 글자 없는 그림만 그리고, 제목은 앱이 내장 글꼴로 얹는다.**
 *  ① 프롬프트에 "book cover/title"이 긍정 서술로 있으면 모델이 가짜 영문 제목을 그려 넣는다(실측).
 *  ② 그림에 구워진 제목은 글꼴·크기·위치를 못 고치고, 한 글자만 바꿔도 통째로 다시 그려야 한다(1분+).
 * 그림(원본 아트)을 따로 보관하므로 제목만 다시 조판하는 것은 재생성 없이 즉시 된다.
 *
 * ⚠️ 그림 URL은 반드시 **CORS를 허용하는 스킴**(ice-cover)이어야 한다. 권한이 없는 스킴에
 *    crossOrigin='anonymous'를 붙이면 이미지 로드 자체가 깨지고, 안 붙이면 캔버스가 오염돼
 *    toDataURL()이 SecurityError로 막힌다 — 둘은 한 쌍이다(실측).
 */
import { fontStack } from '../state/settings'

export type TitlePos = 'top' | 'center' | 'bottom'

export interface CoverTitleOptions {
  /** 얹을 제목(줄바꿈으로 여러 줄). 비어 있거나 off면 그림만 그린다. */
  title: string
  on: boolean
  /** 내장 글꼴 키(state/settings의 FONTS). */
  fontKey: string
  /** 캔버스 폭 대비 글자 크기(%). */
  sizePct: number
  color: string
  pos: TitlePos
}

/** 제목이 앉는 세로 위치(블록 중심). 위/아래는 가장자리에서 16% 안쪽. */
function centerY(height: number, blockH: number, pos: TitlePos): number {
  if (pos === 'top') return height * 0.16 + blockH / 2
  if (pos === 'bottom') return height * 0.84 - blockH / 2
  return height / 2
}

/**
 * 그림을 캔버스에 그리고 제목을 얹는다. 그림을 못 읽으면 아무것도 하지 않고 false.
 * 취소 신호(cancelled)는 호출부가 언마운트·재실행 시 넘겨 준다 — 늦게 도착한 그림이 새 그림을 덮지 않게.
 */
export async function drawTitledCover(
  canvas: HTMLCanvasElement,
  artUrl: string,
  opts: CoverTitleOptions,
  cancelled: () => boolean = () => false
): Promise<boolean> {
  const img = new Image()
  img.crossOrigin = 'anonymous' // 캔버스 오염 방지 — 이게 없으면 toDataURL()이 막힌다
  img.src = artUrl
  try {
    await img.decode()
  } catch {
    return false // 아직 그림이 없거나 로드 실패
  }
  if (cancelled()) return false

  canvas.width = img.naturalWidth || 1024
  canvas.height = img.naturalHeight || 1536
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const lines = opts.title
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (!opts.on || lines.length === 0) return true

  const px = Math.round((canvas.width * opts.sizePct) / 100)
  const font = `700 ${px}px ${fontStack(opts.fontKey)}`
  await document.fonts.load(font).catch(() => {}) // 내장 글꼴이 준비된 뒤에 그린다
  if (cancelled()) return false

  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = opts.color
  // 어떤 그림 위에서도 읽히게 — 부드러운 그림자로 대비를 만든다.
  ctx.shadowColor = opts.color === '#ffffff' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.5)'
  ctx.shadowBlur = Math.round(px * 0.35)

  const lh = px * 1.3
  const blockH = lines.length * lh
  const cy = centerY(canvas.height, blockH, opts.pos)
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2, cy - blockH / 2 + lh / 2 + i * lh)
  })
  return true
}
