/** 라이트박스(자료 확대 보기) 상태 — 이미지 확대·동영상 재생, 이전·다음(§6.10). */
import { create } from 'zustand'
import type { AssetItem } from '../../../shared/types'
import { kindOf } from '../lib/media'

export interface LightboxItem {
  path: string
  kind: AssetItem['kind']
}

interface LightboxState {
  items: LightboxItem[]
  index: number
  open: (items: Array<LightboxItem | string>, index: number) => void
  close: () => void
  step: (delta: number) => void
  /** 지운 자료를 목록에서 빼고 이웃으로 옮긴다(마지막 한 장이면 창을 닫는다). */
  drop: (path: string) => void
}

export const useLightbox = create<LightboxState>((set, get) => ({
  items: [],
  index: 0,
  open: (items, index) =>
    set({
      items: items.map((it) => (typeof it === 'string' ? { path: it, kind: kindOf(it) } : it)),
      index
    }),
  close: () => set({ items: [], index: 0 }),
  step: (delta) => {
    const { items, index } = get()
    if (items.length === 0) return
    set({ index: (index + delta + items.length) % items.length })
  },
  drop: (path) => {
    const { items, index } = get()
    const next = items.filter((it) => it.path !== path)
    if (next.length === 0) {
      set({ items: [], index: 0 })
      return
    }
    // 지운 자리를 그대로 물려받는다(맨 끝을 지웠으면 한 칸 앞으로) — 연달아 지우기 편하게.
    set({ items: next, index: Math.min(index, next.length - 1) })
  }
}))
