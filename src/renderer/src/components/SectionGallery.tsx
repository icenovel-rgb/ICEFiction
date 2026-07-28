/**
 * 섹션 갤러리 — 원고/캐릭터/세계관/노트의 "최상단" 화면(BLUEPRINT §6.2).
 *
 * 바인더에서 섹션(또는 폴더)을 누르면 그 안의 문서들이 카드로 죽 펼쳐진다. 캐릭터는 첨부한 얼굴
 * 이미지가 표지가 되고, 카드를 누르면 그 문서가 에디터로 열린다. 책장(서재)이 책을 고르는 화면이라면,
 * 이건 책 안에서 인물·장면을 고르는 화면이다.
 */
import { useMemo, useState } from 'react'
import type { TreeNode } from '../../../shared/types'
import { useStore } from '../state/store'
import { assetUrl } from '../lib/media'
import { openPrompt } from '../ui/dialogs'
import { coverImgUrl, useImageStudio } from '../ui/imageStudio'
import { SECTION_LABEL, SECTION_TYPE, TYPE_GLYPH } from '../lib/sections'

const SECTION_HINT: Record<string, string> = {
  manuscript: '챕터를 눌러 이어 쓰세요.',
  characters: '인물 카드를 눌러 시트를 엽니다. 인스펙터에서 이미지를 붙이면 여기 얼굴이 뜹니다.',
  world: '설정 문서를 눌러 엽니다. 폴더로 카테고리를 나눌 수 있습니다.',
  notes: '메모를 눌러 엽니다.',
  style:
    '문체지침에 적은 규칙은 AI의 모든 요청에 항상 실립니다. samples 폴더에 기존 원고를 넣으면 그 문체를 따라 씁니다.'
}

const STATUS_LABEL: Record<string, string> = { draft: '초고', revising: '퇴고 중', done: '완료' }

/** 트리에서 경로에 해당하는 노드를 찾는다. */
function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const hit = findNode(n.children, path)
      if (hit) return hit
    }
  }
  return null
}

/** 폴더 아래 문서를 모두 평탄화한다(하위 폴더 포함). 폴더 자체도 따로 모은다. */
function collect(node: TreeNode): { docs: TreeNode[]; folders: TreeNode[] } {
  const docs: TreeNode[] = []
  const folders: TreeNode[] = []
  const walk = (n: TreeNode, top: boolean): void => {
    for (const c of n.children ?? []) {
      if (c.isDir) {
        if (top) folders.push(c)
        walk(c, false)
      } else {
        docs.push(c)
      }
    }
  }
  walk(node, true)
  return { docs, folders }
}

function Card({ node }: { node: TreeNode }): React.ReactElement {
  const selectDoc = useStore((s) => s.selectDoc)
  const coverVersion = useImageStudio((s) => s.coverVersion)
  const glyph = TYPE_GLYPH[node.type] ?? '✦'
  // 문서 표지(§7.6)가 있으면 그것을, 없으면 첨부 이미지 첫 장을 표지로 쓴다.
  const cover = node.cover ? coverImgUrl(node.cover, coverVersion) : node.image ? assetUrl(node.image) : ''

  return (
    <button className="gal-card" onClick={() => void selectDoc(node.path)} title={node.path}>
      <div className="gal-cover">
        {cover ? (
          <img className="gal-cover-img" src={cover} alt="" draggable={false} />
        ) : (
          <span className="gal-cover-glyph">{glyph}</span>
        )}
        {node.status && <span className={`gal-status s-${node.status}`}>{STATUS_LABEL[node.status]}</span>}
      </div>
      <div className="gal-meta">
        <div className="gal-title">{node.name}</div>
        {node.synopsis ? (
          <div className="gal-synopsis">{node.synopsis}</div>
        ) : (
          <div className="gal-synopsis gal-empty-syn">줄거리 없음</div>
        )}
      </div>
    </button>
  )
}

export function SectionGallery(): React.ReactElement | null {
  const tree = useStore((s) => s.tree)
  const galleryPath = useStore((s) => s.galleryPath)
  const closeGallery = useStore((s) => s.closeGallery)
  const openGallery = useStore((s) => s.openGallery)
  const createDoc = useStore((s) => s.createDoc)
  const [query, setQuery] = useState('')

  const node = useMemo(
    () => (galleryPath ? findNode(tree, galleryPath) : null),
    [tree, galleryPath]
  )

  if (!galleryPath || !node) return null

  const section = galleryPath.split('/')[0]
  const label = SECTION_LABEL[galleryPath] ?? node.name
  const { docs, folders } = collect(node)

  const q = query.trim().toLowerCase()
  const shown = q
    ? docs.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.synopsis ?? '').toLowerCase().includes(q) ||
          (d.aliases ?? []).some((a) => a.toLowerCase().includes(q))
      )
    : docs

  async function onNew(): Promise<void> {
    const title = await openPrompt({
      title: `새 ${label}`,
      defaultValue: '제목 없음',
      confirmLabel: '만들기'
    })
    if (title) {
      const type = SECTION_TYPE[section] ?? 'note'
      await createDoc(galleryPath!, type, title)
    }
  }

  return (
    <div className="gallery">
      <header className="gal-header">
        <div className="gal-head-left">
          <h2 className="gal-heading">{label}</h2>
          <span className="gal-count">{docs.length}개</span>
        </div>
        <div className="gal-head-tools">
          <input
            className="gal-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목·줄거리 검색"
          />
          <button className="gal-new" onClick={() => void onNew()}>
            + 새 {label}
          </button>
          <button className="gal-close" onClick={closeGallery} title="갤러리 닫고 원고로">
            ✕
          </button>
        </div>
      </header>

      <div className="gal-hint">{SECTION_HINT[galleryPath] ?? '문서를 눌러 엽니다.'}</div>

      {folders.length > 0 && !q && (
        <div className="gal-folders">
          {folders.map((f) => (
            <button key={f.path} className="gal-folder" onClick={() => openGallery(f.path)}>
              🗀 {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="gal-grid">
        {shown.length === 0 ? (
          <div className="gal-blank">
            {q ? `“${query}”에 맞는 문서가 없습니다.` : `아직 ${label}이(가) 없습니다.`}
          </div>
        ) : (
          shown.map((d) => <Card key={d.path} node={d} />)
        )}
      </div>
    </div>
  )
}
