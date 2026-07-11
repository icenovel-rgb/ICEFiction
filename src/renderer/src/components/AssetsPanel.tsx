/**
 * 자료 갤러리 — assets/의 이미지·동영상 썸네일 그리드(BLUEPRINT §6.10).
 * 클릭 → 라이트박스로 확대/재생. 파일을 창에 끌어놓으면 반입된다(App onDrop).
 */
import { useState } from 'react'
import { toStandardEmbed } from '../../../shared/mdEmbed'
import { assetUrl, baseName } from '../lib/media'
import { useStore } from '../state/store'
import { openConfirm } from '../ui/dialogs'
import { useLightbox } from '../ui/lightbox'

const isPdf = (name: string): boolean => /\.pdf$/i.test(name)

export function AssetsPanel(): React.ReactElement {
  const assets = useStore((s) => s.assets)
  const loadAssets = useStore((s) => s.loadAssets)
  const importAssets = useStore((s) => s.importAssets)
  const refreshTree = useStore((s) => s.refreshTree)
  const openLightbox = useLightbox((s) => s.open)
  const [tidyMsg, setTidyMsg] = useState<string | null>(null)

  async function onTidyLinks(): Promise<void> {
    const yes = await openConfirm({
      title: '이미지 링크 호환 정리',
      message:
        '옛 방식(![[..]])으로 넣은 이미지 링크를 다른 프로그램에서도 열리는 표준 마크다운으로 바꿉니다.\n원본은 snapshots 폴더에 자동 백업됩니다.',
      confirmLabel: '정리'
    })
    if (!yes) return
    const r = await window.api.convertLegacyEmbeds()
    await refreshTree()
    setTidyMsg(
      r.files === 0
        ? '바꿀 옛 링크가 없습니다.'
        : `${r.files}개 문서의 링크 ${r.embeds}개를 표준으로 바꿨습니다.`
    )
    setTimeout(() => setTidyMsg(null), 4000)
  }

  return (
    <div className="assets">
      <div className="assets-toolbar">
        <button className="assets-add" onClick={() => void importAssets()}>
          + 파일 추가
        </button>
        <div className="assets-tools">
          <span className="assets-count">{assets.length}개</span>
          <button onClick={() => void onTidyLinks()} title="옛 이미지 링크를 표준 마크다운으로 정리">
            ⇄
          </button>
          <button onClick={() => void loadAssets()} title="새로고침">
            ⟳
          </button>
          <button onClick={() => void window.api.openProjectFolder()} title="프로젝트 폴더 열기">
            📁
          </button>
        </div>
      </div>
      {tidyMsg && <div className="assets-tidymsg">{tidyMsg}</div>}
      {assets.length === 0 ? (
        <div className="assets-empty">
          자료가 없습니다.
          <br />
          <span>이미지·동영상을 창에 끌어놓으면 여기에 모입니다.</span>
        </div>
      ) : (
        <div className="assets-grid">
          {assets.map((a, i) => (
            <button
              key={a.path}
              className="asset-tile"
              onClick={() =>
                isPdf(a.name) ? void window.api.openPdf(a.path) : openLightbox(assets, i)
              }
              title={a.name}
            >
              {a.kind === 'image' ? (
                <img
                  src={assetUrl(a.path)}
                  alt={a.name}
                  loading="lazy"
                  draggable
                  onDragStart={(e) => {
                    // 편집기 드롭 핸들러는 루트경로(x-ice-asset)를 받아 문서 기준 표준 임베드로 바꾼다.
                    // text/plain은 CM 밖에 떨어졌을 때의 폴백 — 현재 문서 기준 표준 임베드로 미리 만들어 둔다.
                    e.dataTransfer.setData('application/x-ice-asset', a.path)
                    e.dataTransfer.setData(
                      'text/plain',
                      toStandardEmbed(a.path, useStore.getState().activePath)
                    )
                  }}
                />
              ) : a.kind === 'video' ? (
                <div className="asset-badge">▶</div>
              ) : (
                <div className="asset-badge">📄</div>
              )}
              <span className="asset-name">{baseName(a.path)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
