/** 자료 미디어 헬퍼 — 확장자로 종류 판정 + ice-asset:// URL(§6.10). */
import type { AssetItem } from '../../../shared/types'

const IMG = /\.(png|jpe?g|gif|webp|svg|bmp)$/i
const VID = /\.(mp4|webm|mov|mkv|m4v)$/i

export function kindOf(path: string): AssetItem['kind'] {
  if (IMG.test(path)) return 'image'
  if (VID.test(path)) return 'video'
  return 'other'
}

export const assetUrl = (relPath: string): string => window.api.assetUrl(relPath)

export function baseName(path: string): string {
  return path.split('/').pop() ?? path
}
