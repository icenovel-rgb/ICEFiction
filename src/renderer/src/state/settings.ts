/**
 * 집필 화면 설정(보기·테마) — 줄번호/종이색/글자색/글꼴/글자크기/줄간격(BLUEPRINT §8.1).
 *
 * 기기별 사용자 취향이라 localStorage에 저장(zustand persist) — 프로젝트 폴더가 아니라 앱에 붙는다.
 * 실제 적용은 CSS 변수(--paper-*, --gutter-display)로 하며, CM6 테마가 그 변수를 읽는다(applySettings).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SECTION_VIEW, type GalleryView } from '../lib/sections'
import type { QuoteStyle } from '../../../shared/quoteStyle'

export type ThemeKey = 'sepia' | 'dark' | 'white'

/** 앱 전체(도구창) 밝기 — 원고 종이 테마(ThemeKey)와 별개. 워드/노션처럼 앱 크롬 톤. */
export type AppMode = 'light' | 'dark'

export const THEMES: Record<ThemeKey, { label: string; bg: string; text: string }> = {
  sepia: { label: '세피아', bg: '#f7f3ea', text: '#23201a' },
  dark: { label: '다크', bg: '#1e1f22', text: '#d6d3cc' },
  white: { label: '화이트', bg: '#ffffff', text: '#1a1a1a' }
}

/**
 * 글꼴 목록. 내장(번들) 글꼴은 label에 ✓ 표시 — PC에 설치돼 있지 않아도 앱이 파일을 품고 있어
 * 어디서나 같은 모양으로 보인다(fonts.css @font-face). 나머지는 OS 설치 글꼴에 의존한다.
 */
export const FONTS: { key: string; label: string; stack: string }[] = [
  { key: 'nanummyeongjo', label: '나눔명조 ✓', stack: "'NanumMyeongjo', 'Batang', serif" },
  { key: 'kopubbatang', label: 'KoPub 바탕 ✓', stack: "'KoPubWorldBatang', 'Batang', serif" },
  { key: 'nanumgothic', label: '나눔고딕 ✓', stack: "'NanumGothic', 'Malgun Gothic', sans-serif" },
  { key: 'kopubdotum', label: 'KoPub 돋움 ✓', stack: "'KoPubWorldDotum', 'Malgun Gothic', sans-serif" },
  { key: 'myeongjo', label: '명조(바탕)', stack: "'Noto Serif KR', 'Batang', serif" },
  { key: 'malgun', label: '맑은 고딕', stack: "'Malgun Gothic', 'Segoe UI', sans-serif" },
  { key: 'gulim', label: '굴림', stack: "'Gulim', sans-serif" }
]

export function fontStack(key: string): string {
  return (FONTS.find((f) => f.key === key) ?? FONTS[0]).stack
}

/** 문단 정렬 — 원고 본문 text-align(§8.1). 기본은 양쪽 정렬(justify). */
export type TextAlign = 'left' | 'center' | 'right' | 'justify'

/**
 * 문단 첫 줄 모양(§8.1).
 *  · none   그대로
 *  · indent 들여쓰기 — 첫 줄만 안으로(소설 조판의 기본)
 *  · hang   내어쓰기 — 첫 줄만 밖으로, 나머지 줄이 안으로(대사·목록형 원고)
 *
 * 둘은 같은 text-indent 축이라 **동시에 켤 수 없다** → 모드 하나 + 크기 하나로 묶는다.
 */
export type FirstLineMode = 'none' | 'indent' | 'hang'

interface SettingsState {
  showLineNumbers: boolean
  appMode: AppMode
  /** 바인더(좌)·인스펙터 등 우측 패널 표시 여부 — 접으면 원고에만 집중(집중 모드). */
  binderOpen: boolean
  rightOpen: boolean
  /**
   * 원고를 화면 가운데 고정(§8). 켜면 한쪽 패널만 열어도 원고가 좌우로 밀리지 않는다 —
   * 열린 패널 반대쪽에 같은 만큼 여백을 비워 둔다(패널이 글자를 가리지 않는다).
   */
  centerPaper: boolean
  theme: ThemeKey
  fontKey: string
  fontSizePx: number
  lineHeight: number
  /** 원고 문단 정렬(좌/가운데/우/양쪽). 기본 양쪽 정렬. */
  textAlign: TextAlign
  /** 문단과 문단 사이 간격(em). 이게 있으면 빈 줄을 넣지 않아도 문단이 떨어져 보인다(§8.1). */
  paraGapEm: number
  /** 문단 첫 줄 모양 — 없음/들여쓰기/내어쓰기. */
  firstLineMode: FirstLineMode
  /** 들여쓰기·내어쓰기 폭(em). */
  firstLineEm: number
  /**
   * 대사가 연속될 때 그 사이 문단 간격을 없앤다(§8.1).
   * 서술→대사 첫 줄, 대사 마지막 줄→서술 경계는 그대로 벌어진다 — 대사 덩어리만 붙는다.
   */
  tightDialogue: boolean
  /** 따옴표를 치면 닫는 짝까지 넣고 커서를 안으로(§6.1c). */
  autoPairQuotes: boolean
  /**
   * 따옴표 **모양**(§6.1c) — 곧은 `"` / 둥근 `“ ”`. 자판에는 곧은 것 하나뿐이라, 둥근 따옴표로
   * 쓰려면 앱이 갈아 끼워 줘야 한다. 기본 keep = 친 그대로(지금까지의 동작을 말없이 바꾸지 않는다).
   */
  quoteStyle: QuoteStyle
  /** 줄 앞에서 `-`를 두 번 치면 불릿(`• `)으로 바꾼다. 세 번이면 구분선(`---`)(§6.1c). */
  dashBullet: boolean
  /** 사용자가 직접 고른 색(있으면 프리셋 색을 덮음). 프리셋 바꾸면 초기화. */
  customBg: string | null
  customText: string | null
  /** 섹션별 갤러리 보기(표지형·리스트형). 비어 있으면 섹션 기본값(SECTION_VIEW)을 따른다(§6.2). */
  galleryViews: Record<string, GalleryView>

  patch: (p: Partial<SettingsState>) => void
  setTheme: (t: ThemeKey) => void
  setGalleryView: (section: string, view: GalleryView) => void
  resetColors: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      showLineNumbers: false, // 소설(산문) 기본은 줄번호 숨김 — 필요하면 켠다
      appMode: 'dark', // 기본은 지금까지의 어두운 도구창
      binderOpen: true,
      rightOpen: true,
      centerPaper: true, // 글 쓰는 자리는 흔들리지 않아야 한다 — 기본으로 켠다
      theme: 'sepia',
      fontKey: 'nanumgothic', // 기본 글꼴 = 내장 나눔고딕(어느 PC에서나 동일하게 보인다)
      fontSizePx: 17,
      lineHeight: 1.9,
      textAlign: 'justify', // 소설 기본은 양쪽 정렬(반듯한 판면)
      paraGapEm: 0.7, // 엔터를 두 번 치지 않아도 문단이 갈라져 보이는 최소한
      firstLineMode: 'none',
      firstLineEm: 1,
      tightDialogue: false, // 기존 원고의 모양을 말없이 바꾸지 않는다 — 켜고 싶은 사람만 켠다
      autoPairQuotes: true, // 대사를 가장 많이 두드리므로 기본으로 켠다
      quoteStyle: 'keep', // 기존 원고의 모양을 말없이 바꾸지 않는다 — 원하는 사람만 고른다
      dashBullet: true,
      customBg: null,
      customText: null,
      galleryViews: {},

      patch: (p) => set(p),
      setTheme: (t) => set({ theme: t, customBg: null, customText: null }),
      setGalleryView: (section, view) =>
        set((s) => ({ galleryViews: { ...s.galleryViews, [section]: view } })),
      resetColors: () => set({ customBg: null, customText: null })
    }),
    {
      name: 'icefiction-settings',
      version: 1,
      /**
       * v0 → v1: 기본 글꼴을 '명조(바탕)'에서 **내장 나눔고딕**으로 바꿨다.
       * 옛 기본값(myeongjo)을 그대로 쓰던 사용자만 옮긴다 — 직접 다른 글꼴을 고른 사람은 건드리지 않는다.
       * 옛 기본값은 OS에 Noto Serif KR이 없으면 엉뚱한 글꼴로 떨어졌다(내장 글꼴 도입 전 한계).
       */
      migrate: (persisted: unknown, version: number) => {
        const s = (persisted ?? {}) as Partial<SettingsState>
        if (version < 1 && s.fontKey === 'myeongjo') return { ...s, fontKey: 'nanumgothic' }
        return s
      }
    }
  )
)

/**
 * 이 섹션을 지금 어떤 보기로 펼칠 것인가 — 사용자가 고른 값이 있으면 그것, 없으면 섹션 기본값.
 * 하위 폴더 갤러리도 최상위 섹션의 선택을 따른다(같은 성격의 문서라 보기를 따로 기억할 이유가 없다).
 */
export function galleryViewOf(s: Pick<SettingsState, 'galleryViews'>, section: string): GalleryView {
  return s.galleryViews?.[section] ?? SECTION_VIEW[section] ?? 'cover'
}

/** 색(#rrggbb)이 어두운지 — 명도(0.299R+0.587G+0.114B) 기준. 마크다운 색 대비 판정용. */
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

/** 프리셋 + 커스텀 오버라이드를 합친 실제 색. */
export function effectiveColors(s: SettingsState): { bg: string; text: string } {
  return {
    bg: s.customBg ?? THEMES[s.theme].bg,
    text: s.customText ?? THEMES[s.theme].text
  }
}

/** 설정을 CSS 변수로 반영한다(:root). CM6 테마와 주변 영역이 이 변수를 읽는다. */
export function applySettings(s: SettingsState): void {
  // 앱 전체 밝기 — data 속성으로 CSS가 라이트 팔레트를 덮게 한다(:root[data-app-mode='light']).
  document.documentElement.setAttribute('data-app-mode', s.appMode)
  const root = document.documentElement.style
  const { bg, text } = effectiveColors(s)
  // 종이 밝기에 따라 마크다운 색(--md-*)을 밝게/진하게 — 어두운 종이에서 강조색이 묻히지 않게.
  document.documentElement.setAttribute('data-paper-dark', isDarkColor(bg) ? 'true' : 'false')
  root.setProperty('--paper-bg', bg)
  root.setProperty('--paper-text', text)
  root.setProperty('--paper-font', fontStack(s.fontKey))
  root.setProperty('--paper-fontsize', `${s.fontSizePx}px`)
  root.setProperty('--paper-lineheight', String(s.lineHeight))
  root.setProperty('--paper-align', s.textAlign ?? 'justify')
  // 문단 모양(§8.1) — 간격은 줄 아래 여백으로, 첫 줄 모양은 text-indent(+내어쓰기면 왼쪽 여백)로.
  root.setProperty('--paper-para-gap', `${s.paraGapEm ?? 0}em`)
  // 연속 대사 줄의 아래 여백 — 옵션이 켜져 있으면 0, 아니면 평소 문단 간격.
  // 데코(`.cm-tight-dialogue`)는 항상 붙어 있고 실제 값만 여기서 갈아끼운다(즉시 반영).
  root.setProperty('--paper-tight-gap', s.tightDialogue ? '0px' : `${s.paraGapEm ?? 0}em`)
  const first = firstLineOffsets(s)
  root.setProperty('--paper-indent', first.indent)
  root.setProperty('--paper-hang-pad', first.pad)
  root.setProperty('--gutter-display', s.showLineNumbers ? 'flex' : 'none')
}

/**
 * 첫 줄 모양을 CSS 두 값으로 바꾼다.
 *  · 들여쓰기 = text-indent 양수
 *  · 내어쓰기 = text-indent 음수 + 같은 크기의 왼쪽 여백(그래야 첫 줄만 밖으로 나가고 판면은 유지된다)
 */
export function firstLineOffsets(s: Pick<SettingsState, 'firstLineMode' | 'firstLineEm'>): {
  indent: string
  pad: string
} {
  const em = s.firstLineEm ?? 0
  if (s.firstLineMode === 'indent') return { indent: `${em}em`, pad: '0px' }
  if (s.firstLineMode === 'hang') return { indent: `-${em}em`, pad: `${em}em` }
  return { indent: '0px', pad: '0px' }
}
