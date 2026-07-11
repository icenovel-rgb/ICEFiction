/**
 * 바인더 — 좌측 문서 트리(BLUEPRINT §6.2). 섹션(원고/캐릭터/세계관/노트) 재귀 렌더.
 * 문서 추가 + 카테고리(폴더) 추가. 세계관 카테고리는 사용자가 직접 만든다(기본 제공 없음).
 */
import { useState } from 'react'
import type { DocType, TreeNode } from '../../../shared/types'
import { useStore } from '../state/store'
import { openConfirm, openPrompt } from '../ui/dialogs'

const SECTION_LABEL: Record<string, string> = {
  manuscript: '원고',
  characters: '캐릭터',
  world: '세계관',
  notes: '노트'
}

const SECTION_TYPE: Record<string, DocType> = {
  manuscript: 'chapter',
  characters: 'character',
  world: 'world',
  notes: 'note'
}

const STATUS_LABEL: Record<string, string> = { draft: '초', revising: '퇴', done: '완' }

/** 경로의 최상위 섹션(문서 타입 결정용). */
function sectionOf(path: string): string {
  return path.split('/')[0]
}

function useRowActions(node: TreeNode): {
  onRename: (e: React.MouseEvent) => Promise<void>
  onDelete: (e: React.MouseEvent) => Promise<void>
} {
  const renameEntry = useStore((s) => s.renameEntry)
  const trashEntry = useStore((s) => s.trashEntry)
  const kind = node.isDir ? (node.type === 'part' ? '부' : '카테고리') : '문서'

  async function onRename(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const name = await openPrompt({ title: `${kind} 이름 변경`, defaultValue: node.name, confirmLabel: '변경' })
    if (name && name !== node.name) await renameEntry(node.path, name)
  }
  async function onDelete(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const yes = await openConfirm({
      title: `"${node.name}" 삭제`,
      message: node.isDir
        ? '이 폴더와 안의 내용을 휴지통(trash)으로 옮깁니다.'
        : '이 문서를 휴지통(trash)으로 옮깁니다.',
      confirmLabel: '휴지통으로',
      danger: true
    })
    if (yes) await trashEntry(node.path)
  }
  return { onRename, onDelete }
}

function RowTools({ node }: { node: TreeNode }): React.ReactElement {
  const { onRename, onDelete } = useRowActions(node)
  return (
    <div className="binder-row-tools">
      <button onClick={onRename} title="이름 변경">
        ✎
      </button>
      <button className="danger" onClick={onDelete} title="삭제">
        🗑
      </button>
    </div>
  )
}

function Row({ node, depth }: { node: TreeNode; depth: number }): React.ReactElement {
  const [open, setOpen] = useState(depth < 1)
  const activePath = useStore((s) => s.activePath)
  const selectDoc = useStore((s) => s.selectDoc)
  const createDoc = useStore((s) => s.createDoc)
  const isActive = activePath === node.path

  if (node.isDir) {
    async function onAddInside(e: React.MouseEvent): Promise<void> {
      e.stopPropagation()
      const title = await openPrompt({
        title: `"${node.name}"에 새 문서`,
        defaultValue: '제목 없음',
        confirmLabel: '만들기'
      })
      if (title) await createDoc(node.path, SECTION_TYPE[sectionOf(node.path)] ?? 'note', title)
    }
    return (
      <div>
        <div
          className="binder-row binder-dir"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setOpen((v) => !v)}
          onContextMenu={(e) => {
            e.preventDefault()
            void window.api.revealInOs(node.path)
          }}
        >
          <span className="binder-caret">{open ? '▾' : '▸'}</span>
          <span className="binder-name">{node.name}</span>
          <button className="binder-row-add" onClick={onAddInside} title="여기에 문서 추가">
            +
          </button>
          <RowTools node={node} />
        </div>
        {open && node.children?.map((c) => <Row key={c.path} node={c} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <div
      className={`binder-row binder-file${isActive ? ' active' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() => void selectDoc(node.path)}
      onContextMenu={(e) => {
        e.preventDefault()
        void window.api.revealInOs(node.path)
      }}
      title={node.path}
    >
      {node.status && <span className={`binder-badge s-${node.status}`}>{STATUS_LABEL[node.status]}</span>}
      <span className="binder-name">{node.name}</span>
      <RowTools node={node} />
    </div>
  )
}

function SectionHeader({ node }: { node: TreeNode }): React.ReactElement {
  const createDoc = useStore((s) => s.createDoc)
  const createFolder = useStore((s) => s.createFolder)
  const label = SECTION_LABEL[node.path] ?? node.name
  const folderLabel = node.path === 'manuscript' ? '부' : '카테고리'

  async function onAddDoc(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const title = await openPrompt({
      title: `새 ${label}`,
      defaultValue: '제목 없음',
      placeholder: `${label} 제목`,
      confirmLabel: '만들기'
    })
    if (title) await createDoc(node.path, SECTION_TYPE[node.path] ?? 'note', title)
  }

  async function onAddFolder(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const name = await openPrompt({
      title: `새 ${folderLabel}`,
      placeholder: node.path === 'world' ? '예: 장소, 세력, 마법체계…' : `${folderLabel} 이름`,
      confirmLabel: '만들기'
    })
    if (name) await createFolder(node.path, name)
  }

  return (
    <div className="binder-section">
      <span className="binder-section-label">{label}</span>
      <div className="binder-section-tools">
        <button className="binder-add" onClick={onAddFolder} title={`${folderLabel} 추가`}>
          🗀
        </button>
        <button className="binder-add" onClick={onAddDoc} title={`${label} 추가`}>
          +
        </button>
      </div>
    </div>
  )
}

export function Binder(): React.ReactElement {
  const tree = useStore((s) => s.tree)
  const openFolder = (): void => void window.api.openProjectFolder()

  return (
    <div className="binder">
      <div className="binder-toolbar">
        <button className="binder-tool" onClick={openFolder} title="프로젝트 폴더 열기">
          📁 폴더 열기
        </button>
      </div>
      <div className="binder-body">
        {tree.map((section) => (
          <div key={section.path} className="binder-section-block">
            <SectionHeader node={section} />
            {section.children?.map((c) => <Row key={c.path} node={c} depth={0} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
