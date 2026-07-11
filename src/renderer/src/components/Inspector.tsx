/**
 * 인스펙터 — 현재 문서의 프론트매터(메타데이터) 편집(BLUEPRINT §6.5, §8).
 */
import type { DocStatus } from '../../../shared/types'
import { useStore } from '../state/store'
import { assetUrl, baseName, kindOf } from '../lib/media'
import { useLightbox } from '../ui/lightbox'
import { pickAsset } from '../ui/picker'

const STATUS_OPTIONS: { value: DocStatus; label: string }[] = [
  { value: 'draft', label: '초고' },
  { value: 'revising', label: '퇴고 중' },
  { value: 'done', label: '완료' }
]

export function Inspector(): React.ReactElement {
  const activePath = useStore((s) => s.activePath)
  const fm = useStore((s) => s.frontmatter)
  const setFrontmatter = useStore((s) => s.setFrontmatter)
  const attachImage = useStore((s) => s.attachImage)
  const detachImage = useStore((s) => s.detachImage)
  const openLightbox = useLightbox((s) => s.open)

  if (!activePath) {
    return <div className="inspector inspector-empty">선택된 문서 없음</div>
  }

  const images = fm.images ?? []
  async function onAddImage(): Promise<void> {
    const path = await pickAsset()
    if (path) attachImage(path)
  }

  return (
    <div className="inspector">
      <label className="insp-field">
        <span>제목</span>
        <input
          value={fm.title ?? ''}
          onChange={(e) => setFrontmatter({ title: e.target.value })}
          placeholder="제목 없음"
        />
      </label>

      <div className="insp-field">
        <span>이미지 · 자료</span>
        <div className="insp-images">
          {images.map((p) => (
            <div key={p} className="insp-thumb" title={baseName(p)}>
              {kindOf(p) === 'image' ? (
                <img
                  src={assetUrl(p)}
                  alt={baseName(p)}
                  onClick={() => openLightbox(images, images.indexOf(p))}
                />
              ) : (
                <div className="insp-thumb-badge" onClick={() => openLightbox(images, images.indexOf(p))}>
                  {kindOf(p) === 'video' ? '▶' : '📄'}
                </div>
              )}
              <button className="insp-thumb-x" onClick={() => detachImage(p)} title="제거">
                ×
              </button>
            </div>
          ))}
          <button className="insp-add-image" onClick={() => void onAddImage()} title="이미지 추가">
            +
          </button>
        </div>
      </div>

      <label className="insp-field">
        <span>상태</span>
        <select
          value={fm.status ?? 'draft'}
          onChange={(e) => setFrontmatter({ status: e.target.value as DocStatus })}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="insp-field">
        <span>POV(시점 인물)</span>
        <input
          value={fm.pov ?? ''}
          onChange={(e) => setFrontmatter({ pov: e.target.value })}
          placeholder="예: 김철수"
        />
      </label>

      <label className="insp-field">
        <span>별칭 · 호칭 (쉼표로 구분)</span>
        <input
          value={(fm.aliases ?? []).join(', ')}
          onChange={(e) =>
            setFrontmatter({
              aliases: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            })
          }
          placeholder="예: 철수, 형사, 그"
        />
        <span className="insp-hint">이 이름이 장면에 나오면 AI가 이 시트를 자동으로 봅니다(§7.2).</span>
      </label>

      <label className="insp-field">
        <span>시놉시스</span>
        <textarea
          value={fm.synopsis ?? ''}
          onChange={(e) => setFrontmatter({ synopsis: e.target.value })}
          rows={4}
          placeholder="이 장면을 한두 문장으로"
        />
      </label>

      <label className="insp-field">
        <span>목표 글자수</span>
        <input
          type="number"
          value={fm.wordsTarget ?? ''}
          onChange={(e) =>
            setFrontmatter({ wordsTarget: e.target.value ? Number(e.target.value) : undefined })
          }
          placeholder="예: 5000"
        />
      </label>
    </div>
  )
}
