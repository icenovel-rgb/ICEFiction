/**
 * 인앱 입력/확인 모달(zustand) — Electron은 window.prompt()를 지원하지 않으므로 직접 만든다.
 *
 * openPrompt/openConfirm은 Promise를 돌려주어 호출부가 `const v = await openPrompt(...)` 형태로
 * window.prompt처럼 쓸 수 있다. 실제 UI는 <DialogHost/>가 그린다.
 */
import { create } from 'zustand'

export interface PromptReq {
  title: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  danger?: boolean
}

export interface ConfirmReq {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

export interface PromptEntry extends PromptReq {
  id: number
  kind: 'prompt'
  resolve: (v: string | null) => void
}
export interface ConfirmEntry extends ConfirmReq {
  id: number
  kind: 'confirm'
  resolve: (v: boolean) => void
}
export type Entry = PromptEntry | ConfirmEntry

interface DialogState {
  current: Entry | null
  openPrompt: (req: PromptReq) => Promise<string | null>
  openConfirm: (req: ConfirmReq) => Promise<boolean>
  submit: (value: string | boolean | null) => void
}

let seq = 0

export const useDialogs = create<DialogState>((set, get) => ({
  current: null,
  openPrompt(req) {
    return new Promise<string | null>((resolve) => {
      seq += 1
      set({ current: { ...req, id: seq, kind: 'prompt', resolve } })
    })
  },
  openConfirm(req) {
    return new Promise<boolean>((resolve) => {
      seq += 1
      set({ current: { ...req, id: seq, kind: 'confirm', resolve } })
    })
  },
  submit(value) {
    const entry = get().current
    if (!entry) return
    set({ current: null })
    if (entry.kind === 'prompt') entry.resolve(value === null ? null : String(value))
    else entry.resolve(value === true)
  }
}))

export const openPrompt = (req: PromptReq): Promise<string | null> =>
  useDialogs.getState().openPrompt(req)
export const openConfirm = (req: ConfirmReq): Promise<boolean> =>
  useDialogs.getState().openConfirm(req)
