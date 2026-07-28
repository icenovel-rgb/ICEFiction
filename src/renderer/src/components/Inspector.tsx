/**
 * 인스펙터 — 현재 문서의 프론트매터(메타데이터) 편집(BLUEPRINT §6.5, §8).
 */
import type { DocStatus } from '../../../shared/types'
import { useStore } from '../state/store'
import { assetUrl, baseName, kindOf } from '../lib/media'
import { useLightbox } from '../ui/lightbox'
import { pickAsset } from '../ui/picker'
import { coverImgUrl, useImageStudio } from '../ui/imageStudio'
import { openConfirm } from '../ui/dialogs'

const STATUS_OPTIONS: { value: DocStatus; label: string }[] = [
  { value: 'draft', label: '초고' },
  { value: 'revising', label: '퇴고 중' },
  { value: 'done', label: '완료' }
]

/**
 * 문서 표지(§7.6) — 책 표지와 같은 방식이다. AI가 글자 없는 그림을 그리고 앱이 제목을 얹는다.
 * 원고 갤러리의 카드 표지가 되므로 챕터를 그림으로 훑어볼 수 있다.
 */
function CoverField({ path }: { path: string }): React.ReactElement {
  const fm = useStore((s) => s.frontmatter)
  const setFrontmatter = useStore((s) => s.setFrontmatter)
  const refreshTree = useStore((s) => s.refreshTree)
  const openStudio = useImageStudio((s) => s.open)
  const coverVersion = useImageStudio((s) => s.coverVersion)

  async function onRemove(): Promise<void> {
    const yes = await openConfirm({
      title: '표지 제거',
      message: '이 문서의 표지 그림을 지웁니다. 원고 내용은 그대로입니다.',
      confirmLabel: '제거',
      danger: true
    })
    if (!yes) return
    await window.api.removeDocCover(path)
    setFrontmatter({ cover: undefined, coverArt: undefined })
    await refreshTree()
  }

  return (
    <div className="insp-field">
      <span>표지</span>
      {fm.cover && (
        <div className="insp-cover">
          <img
            src={coverImgUrl(fm.cover, coverVersion)}
            alt="표지"
            onClick={() => openStudio({ kind: 'docCover', path })}
            title="눌러서 제목·그림 다시 손보기"
          />
          <button className="insp-thumb-x" onClick={() => void onRemove()} title="표지 제거">
            ×
          </button>
        </div>
      )}
      {/* 클래스를 나눠 둔다 — '이미지 생성'과 같은 이름이면 자동화(E2E)가 둘을 구분하지 못한다. */}
      <button
        className="insp-gen-cover"
        onClick={() => openStudio({ kind: 'docCover', path })}
        title="AI가 글자 없는 그림을 그리고, 제목은 앱이 얹습니다"
      >
        🖼 {fm.cover ? '표지 다시 만들기' : 'AI로 표지 만들기'}
      </button>
      <span className="insp-hint">원고 갤러리에서 이 그림이 카드 표지가 됩니다.</span>
    </div>
  )
}

export function Inspector(): React.ReactElement {
  const activePath = useStore((s) => s.activePath)
  const fm = useStore((s) => s.frontmatter)
  const setFrontmatter = useStore((s) => s.setFrontmatter)
  const attachImage = useStore((s) => s.attachImage)
  const detachImage = useStore((s) => s.detachImage)
  const openLightbox = useLightbox((s) => s.open)
  const openStudio = useImageStudio((s) => s.open)

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

      <CoverField path={activePath} />

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
        {/* AI가 시트를 읽고 얼굴·삽화를 그린다. 첫 장이 갤러리 표지가 된다(§7.6). */}
        <button
          className="insp-gen-image"
          onClick={() => openStudio({ kind: 'doc', path: activePath! })}
          title="AI에게 이 문서의 이미지를 그리게 합니다"
        >
          🎨 AI로 이미지 생성
        </button>
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
    </div>
  )
}
