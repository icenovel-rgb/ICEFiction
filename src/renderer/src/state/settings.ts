/**
 * 집필 화면 설정(보기·테마) — 줄번호/종이색/글자색/글꼴/글자크기/줄간격(BLUEPRINT §8.1).
 *
 * 기기별 사용자 취향이라 localStorage에 저장(zustand persist) — 프로젝트 폴더가 아니라 앱에 붙는다.
 * 실제 적용은 CSS 변수(--paper-*, --gutter-display)로 하며, CM6 테마가 그 변수를 읽는다(applySettings).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeKey = 'sepia' | 'dark' | 'white'

/** 앱 전체(도구창) 밝기 — 원고 종이 테마(ThemeKey)와 별개. 워드/노션처럼 앱 크롬 톤. */
export type AppMode = 'light' | 'dark'

export const THEMES: Record<ThemeKey, { label: string; bg: string; text: string }> = {
  sepia: { label: '세피아', bg: '#f7f3ea', text: '#23201a' },
  dark: { label: '다크', bg: '#1e1f22', text: '#d6d3cc' },
  white: { label: '화이트', bg: '#ffffff', text: '#1a1a1a' }
}

export const FONTS: { key: string; label: string; stack: string }[] = [
  { key: 'myeongjo', label: '명조(바탕)', stack: "'Noto Serif KR', 'Batang', serif" },
  { key: 'nanummyeongjo', label: '나눔명조', stack: "'NanumMyeongjo', 'Batang', serif" },
  { key: 'malgun', label: '맑은 고딕', stack: "'Malgun Gothic', 'Segoe UI', sans-serif" },
  { key: 'nanumgothic', label: '나눔고딕', stack: "'NanumGothic', 'Malgun Gothic', sans-serif" },
  { key: 'gulim', label: '굴림', stack: "'Gulim', sans-serif" }
]

export function fontStack(key: string): string {
  return (FONTS.find((f) => f.key === key) ?? FONTS[0]).stack
}

interface SettingsState {
  showLineNumbers: boolean
  appMode: AppMode
  /** 바인더(좌)·인스펙터 등 우측 패널 표시 여부 — 접으면 원고에만 집중(집중 모드). */
  binderOpen: boolean
  rightOpen: boolean
  theme: ThemeKey
  fontKey: string
  fontSizePx: number
  lineHeight: number
  /** 사용자가 직접 고른 색(있으면 프리셋 색을 덮음). 프리셋 바꾸면 초기화. */
  customBg: string | null
  customText: string | null

  patch: (p: Partial<SettingsState>) => void
  setTheme: (t: ThemeKey) => void
  resetColors: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      showLineNumbers: false, // 소설(산문) 기본은 줄번호 숨김 — 필요하면 켠다
      appMode: 'dark', // 기본은 지금까지의 어두운 도구창
      binderOpen: true,
      rightOpen: true,
      theme: 'sepia',
      fontKey: 'myeongjo',
      fontSizePx: 17,
      lineHeight: 1.9,
      customBg: null,
      customText: null,

      patch: (p) => set(p),
      setTheme: (t) => set({ theme: t, customBg: null, customText: null }),
      resetColors: () => set({ customBg: null, customText: null })
    }),
    { name: 'icefiction-settings' }
  )
)

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
  root.setProperty('--gutter-display', s.showLineNumbers ? 'flex' : 'none')
}
