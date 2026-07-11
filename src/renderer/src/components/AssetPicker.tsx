/**
 * 자료 픽커 모달 — 문서에 붙일 이미지를 자료 풀에서 선택(BLUEPRINT §6.10, §6.3).
 * 이미 반입된 이미지 자료만 보여준다. 없으면 끌어놓기 안내.
 */
import { useEffect } from 'react'
import { assetUrl, baseName } from '../lib/media'
import { useStore } from '../state/store'
import { usePicker } from '../ui/picker'

/** AI에 텍스트로 첨부 가능한 문서(PDF·메모·표 등). 이미지는 별도(vision). */
const isAttachableDoc = (name: string): boolean => /\.(pdf|txt|md|markdown|csv|json|log)$/i.test(name)

export function AssetPicker(): React.ReactElement | null {
  const open = usePicker((s) => s.open)
  const filter = usePicker((s) => s.filter)
  const choose = usePicker((s) => s.choose)
  const assets = useStore((s) => s.assets)
  const loadAssets = useStore((s) => s.loadAssets)
  const importAssets = useStore((s) => s.importAssets)

  useEffect(() => {
    if (open) void loadAssets()
  }, [open, loadAssets])

  if (!open) return null
  // 'attach'(AI 첨부)는 이미지 + 문서(PDF·txt·md·csv…), 'image'는 이미지만.
  const shown =
    filter === 'attach'
      ? assets.filter((a) => a.kind === 'image' || isAttachableDoc(a.name))
      : assets.filter((a) => a.kind === 'image')

  async function onImport(): Promise<void> {
    const imported = await importAssets()
    if (imported.length > 0) choose(imported[0]) // 새로 넣은 자료를 바로 선택
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && choose(null)}>
      <div className="picker">
        <div className="picker-head">
          <span>{filter === 'attach' ? '자료 첨부 (이미지 · PDF · 메모)' : '이미지 선택'}</span>
          <div className="picker-head-tools">
            <button className="picker-import" onClick={() => void onImport()}>
              + 파일에서 추가
            </button>
            <button className="modal-close" onClick={() => choose(null)}>
              ✕
            </button>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="picker-empty">
            {filter === 'attach' ? '반입된 이미지·문서가 없습니다.' : '반입된 이미지가 없습니다.'}
            <br />
            <span>파일을 창에 끌어놓거나 &lsquo;+ 파일에서 추가&rsquo;로 먼저 반입하세요.</span>
          </div>
        ) : (
          <div className="picker-grid">
            {shown.map((a) => (
              <button key={a.path} className="picker-tile" onClick={() => choose(a.path)} title={a.name}>
                {a.kind === 'image' ? (
                  <img src={assetUrl(a.path)} alt={a.name} loading="lazy" />
                ) : (
                  <div className="picker-tile-badge">📄</div>
                )}
                <span>{baseName(a.path)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
