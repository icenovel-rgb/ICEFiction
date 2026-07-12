/**
 * 이미지 스튜디오 열기/닫기 — 라이트박스·자료 픽커와 같은 패턴(전역 모달 1개).
 * 캐릭터 얼굴(doc)과 책 표지(cover) 두 모드를 한 모달이 처리한다(§7.6).
 */
import { create } from 'zustand'
import type { ImageTarget } from '../../../shared/types'

interface StudioState {
  target: ImageTarget | null
  open: (target: ImageTarget) => void
  close: () => void
}

export const useImageStudio = create<StudioState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null })
}))
