/** 자료 픽커 상태 — 캐릭터·문서에 붙일 이미지, 또는 AI에 첨부할 자료(이미지·PDF)를 고른다(Promise 반환). */
import { create } from 'zustand'

/** 'image' = 이미지만(인스펙터 첨부), 'attach' = 이미지·PDF(AI 자료 첨부, §7.5). */
export type PickerFilter = 'image' | 'attach'

interface PickerState {
  open: boolean
  filter: PickerFilter
  resolve: ((path: string | null) => void) | null
  pickAsset: (filter?: PickerFilter) => Promise<string | null>
  choose: (path: string | null) => void
}

export const usePicker = create<PickerState>((set, get) => ({
  open: false,
  filter: 'image',
  resolve: null,
  pickAsset: (filter = 'image') =>
    new Promise<string | null>((resolve) => set({ open: true, filter, resolve })),
  choose: (path) => {
    const r = get().resolve
    set({ open: false, resolve: null })
    r?.(path)
  }
}))

export const pickAsset = (filter?: PickerFilter): Promise<string | null> =>
  usePicker.getState().pickAsset(filter)
