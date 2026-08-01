/**
 * 자료(그림) 삭제 확인 — 자료 갤러리·라이트박스·인스펙터가 **같은 문구**로 묻는다(§6.10).
 *
 * 세 곳에서 각자 다르게 물으면 같은 동작이 화면마다 다른 일처럼 보인다. 특히 이 동작에는
 * 반드시 함께 말해야 할 두 가지가 있다 — **휴지통으로 간다**(영영 사라지지 않는다)는 것과,
 * **본문에 박아 둔 자리는 앱이 건드리지 않는다**(원고를 말없이 고치지 않는다 §7.4)는 것.
 */
import { baseName } from '../lib/media'
import { openConfirm } from './dialogs'
import { useStore } from '../state/store'

/** 확인을 받고 지운다. 지웠으면 true(부른 쪽이 화면을 닫거나 옮길 수 있게). */
export async function trashAssetWithConfirm(path: string): Promise<boolean> {
  const ok = await openConfirm({
    title: '자료 삭제',
    message:
      `“${baseName(path)}”를 휴지통(trash/)으로 옮깁니다.\n\n` +
      '영영 지우는 것이 아니라 옮기는 것이라, 탐색기에서 다시 꺼낼 수 있습니다.\n' +
      '원고 본문에 넣어 둔 자리가 있다면 그 자리는 그대로 남습니다(빈 그림으로 보입니다).',
    confirmLabel: '휴지통으로',
    danger: true
  })
  if (!ok) return false
  await useStore.getState().trashAsset(path)
  return true
}
