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
  }
}))
