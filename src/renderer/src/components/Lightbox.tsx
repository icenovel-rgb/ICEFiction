/**
 * 라이트박스 — 자료 확대 뷰(BLUEPRINT §6.10). 이미지 확대, 동영상 인앱 재생, 이전·다음.
 * 재생 불가 코덱(HEVC 등)은 '시스템 플레이어로 열기' 폴백.
 */
import { useEffect } from 'react'
import { assetUrl, baseName } from '../lib/media'
import { useLightbox } from '../ui/lightbox'

const isPdf = (path: string): boolean => /\.pdf$/i.test(path)

export function Lightbox(): React.ReactElement | null {
  const items = useLightbox((s) => s.items)
  const index = useLightbox((s) => s.index)
  const close = useLightbox((s) => s.close)
  const step = useLightbox((s) => s.step)

  useEffect(() => {
    if (items.length === 0) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items.length, close, step])

  if (items.length === 0) return null
  const item = items[index]
  const url = assetUrl(item.path)

  return (
    <div className="lb-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <button className="lb-close" onClick={close} title="닫기 (Esc)">
        ✕
      </button>
      {items.length > 1 && (
        <button className="lb-nav lb-prev" onClick={() => step(-1)} title="이전 (←)">
          ‹
        </button>
      )}
      <div className="lb-stage">
        {item.kind === 'image' ? (
          <img className="lb-media" src={url} alt={baseName(item.path)} />
        ) : item.kind === 'video' ? (
          <video className="lb-media" src={url} controls autoPlay />
        ) : isPdf(item.path) ? (
          <div className="lb-other">
            <p>📄 {baseName(item.path)}</p>
            <button className="ai-save" onClick={() => void window.api.openPdf(item.path)}>
              PDF 뷰어로 열기
            </button>
            <button onClick={() => void window.api.revealInOs(item.path)}>시스템에서 열기</button>
          </div>
        ) : (
          <div className="lb-other">
            <p>{baseName(item.path)}</p>
            <button onClick={() => void window.api.revealInOs(item.path)}>
              시스템에서 열기
            </button>
          </div>
        )}
        <div className="lb-caption">
          {baseName(item.path)}
          {items.length > 1 && (
            <span className="lb-count">
              {' '}
              · {index + 1}/{items.length}
            </span>
          )}
        </div>
      </div>
      {items.length > 1 && (
        <button className="lb-nav lb-next" onClick={() => step(1)} title="다음 (→)">
          ›
        </button>
      )}
    </div>
  )
}
