/** 문법·단축키 도움말 창 열림 상태(§8.1) — 상단바 ? 아이콘과 보기 탭이 함께 쓴다. */
import { create } from 'zustand'

interface HelpState {
  open: boolean
  show: () => void
  hide: () => void
  toggle: () => void
}

export const useHelp = create<HelpState>((set, get) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set({ open: !get().open })
}))
