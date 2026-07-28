/**
 * 업데이트 확인 — 새 버전이 나왔는지 **GitHub 릴리스에 직접** 물어본다(BLUEPRINT §9.1).
 *
 * 중간에 파일을 두지 않는 이유: 사이트에 latest.json을 두면 배포할 때마다 그 파일도 손으로
 * 갱신해야 하고, 한 번 잊으면 앱이 옛 버전을 최신이라고 말한다. 릴리스가 곧 사실이므로
 * 사실을 직접 읽는다.
 *
 * 실패는 조용히 넘긴다 — 인터넷이 없거나 GitHub가 흔들려도 집필은 계속돼야 한다.
 */
import type { UpdateInfo } from '../../shared/types'
import { compareVersions } from '../../shared/version'

const RELEASES_API = 'https://api.github.com/repos/icenovel-rgb/ICEFiction/releases/latest'
const RELEASES_PAGE = 'https://github.com/icenovel-rgb/ICEFiction/releases/latest'
/** 확인에 오래 매달리지 않는다 — 시작을 붙잡으면 안 된다. */
const TIMEOUT_MS = 6000

interface GhAsset {
  name: string
  browser_download_url: string
  size: number
}
interface GhRelease {
  tag_name?: string
  published_at?: string
  body?: string
  assets?: GhAsset[]
}

/** 이 플랫폼에서 받아야 할 파일 — 없으면 릴리스 페이지로 보낸다. */
function assetFor(assets: GhAsset[], platform: NodeJS.Platform): GhAsset | undefined {
  const ext = platform === 'darwin' ? '.dmg' : '.exe'
  return assets.find((a) => a.name.toLowerCase().endsWith(ext))
}

export class UpdateService {
  /** 마지막 결과를 기억한다 — 창을 열 때마다 GitHub를 두드리지 않기 위해. */
  private cached: UpdateInfo | null = null

  async check(currentVersion: string, platform: NodeJS.Platform = process.platform): Promise<UpdateInfo> {
    if (this.cached) return this.cached

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ICEFiction' },
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`GitHub ${res.status}`)
      const rel = (await res.json()) as GhRelease
      const latest = (rel.tag_name ?? '').replace(/^v/, '')
      if (!latest) throw new Error('릴리스 태그 없음')

      const asset = assetFor(rel.assets ?? [], platform)
      const info: UpdateInfo = {
        checked: true,
        hasUpdate: compareVersions(latest, currentVersion) > 0,
        current: currentVersion,
        latest,
        url: asset?.browser_download_url ?? RELEASES_PAGE,
        pageUrl: RELEASES_PAGE,
        sizeBytes: asset?.size,
        date: (rel.published_at ?? '').slice(0, 10),
        notes: firstLines(rel.body ?? '')
      }
      this.cached = info
      return info
    } catch {
      // 확인 실패는 사용자에게 굳이 알리지 않는다(집필을 방해하지 않는다).
      return { checked: false, hasUpdate: false, current: currentVersion, pageUrl: RELEASES_PAGE }
    } finally {
      clearTimeout(timer)
    }
  }
}

/** 릴리스 노트에서 사람이 읽을 몇 줄만 — 마크다운 표시는 걷어낸다. */
function firstLines(body: string, max = 3): string {
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^[#>\s*-]+/, '').replace(/\*\*/g, '').trim())
    .filter((l) => l.length > 1 && !l.startsWith('|') && !l.startsWith('---'))
  return lines.slice(0, max).join(' · ').slice(0, 200)
}

export const updateService = new UpdateService()
