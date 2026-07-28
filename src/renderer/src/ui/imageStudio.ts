/**
 * 이미지 스튜디오 열기/닫기 — 라이트박스·자료 픽커와 같은 패턴(전역 모달 1개).
 * 캐릭터 얼굴(doc)·본문 삽화(inline)·책 표지(cover)·문서 표지(docCover)를 한 모달이 처리한다(§7.6).
 */
import { create } from 'zustand'
import type { ImageTarget } from '../../../shared/types'

interface StudioState {
  target: ImageTarget | null
  /**
   * 표지를 다시 그릴 때마다 오르는 번호. 표지는 **경로가 그대로인 채 내용만 바뀌므로**
   * URL이 같아 브라우저가 옛 그림을 계속 보여 준다 → 이 번호를 `?v=`로 붙여 캐시를 턴다.
   * 저장할 때만 오르므로 평소에는 이미지가 다시 내려받아지지 않는다.
   */
  coverVersion: number
  open: (target: ImageTarget) => void
  close: () => void
  bumpCover: () => void
}

export const useImageStudio = create<StudioState>((set) => ({
  target: null,
  coverVersion: 0,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
  bumpCover: () => set((s) => ({ coverVersion: s.coverVersion + 1 }))
}))

/** 표지 그림 URL(캐시버스트 포함) — 인스펙터 썸네일·갤러리 카드가 함께 쓴다. */
export function coverImgUrl(relPath: string, version: number): string {
  return `${window.api.assetUrl(relPath)}?v=${version}`
}
