/**
 * 책장(서재) — 홈 화면(ICEWriter 방식). 서재 경로 하나 안에 쌓인 책들을 카드로 보여주고,
 * "새 소설"은 서재 안에 폴더를 자동 생성한다. 파일 탐색기로 폴더를 고르는 일은 없다.
 *
 * 표지: 카드에 표지 이미지(ice-cover://)를 표시하고 지정/변경/제거할 수 있다.
 * 정렬·검색: 제목 검색 + 정렬(수동 드래그·제목·최근·오래된). 수동 정렬 모드에선 카드를 끌어 순서를 바꾼다.
 */
import { useMemo, useState } from 'react'
import type { BookSummary } from '../../../shared/types'
import { useStore } from '../state/store'
import { openConfirm, openPrompt } from '../ui/dialogs'
import iconUrl from '../assets/icon.png'

type SortMode = 'manual' | 'title' | 'recent' | 'oldest'

const SORTS: { value: SortMode; label: string }[] = [
  { value: 'manual', label: '수동 정렬' },
  { value: 'title', label: '제목순' },
  { value: 'recent', label: '최근 수정순' },
  { value: 'oldest', label: '오래된순' }
]

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko', { year: '2-digit', month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}

interface CardProps {
  book: BookSummary
  draggable: boolean
  dragging: boolean
  dropTarget: boolean
  onDragStart: (id: string) => void
  onDragEnterCard: (id: string) => void
  onDragEnd: () => void
  onDropCard: (id: string) => void
}

function BookCard({
  book,
  draggable,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnterCard,
  onDragEnd,
  onDropCard
}: CardProps): React.ReactElement {
  const openBook = useStore((s) => s.openBook)
  const renameBook = useStore((s) => s.renameBook)
  const deleteBook = useStore((s) => s.deleteBook)
  const setBookCover = useStore((s) => s.setBookCover)
  const removeBookCover = useStore((s) => s.removeBookCover)

  async function onRename(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const name = await openPrompt({
      title: '책 제목 변경',
      defaultValue: book.title,
      confirmLabel: '변경'
    })
    if (name && name !== book.title) await renameBook(book.id, name)
  }

  async function onDelete(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const yes = await openConfirm({
      title: `"${book.title}" 삭제`,
      message: '서재의 휴지통(.trash)으로 옮깁니다. 나중에 폴더에서 되살릴 수 있습니다.',
      confirmLabel: '휴지통으로',
      danger: true
    })
    if (yes) await deleteBook(book.id)
  }

  function onSetCover(e: React.MouseEvent): void {
    e.stopPropagation()
    void setBookCover(book.id)
  }

  async function onRemoveCover(e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    const yes = await openConfirm({
      title: '표지 제거',
      message: `"${book.title}"의 표지를 제거하고 기본 표지로 되돌립니다.`,
      confirmLabel: '제거',
      danger: true
    })
    if (yes) await removeBookCover(book.id)
  }

  const className = `book-card${dragging ? ' dragging' : ''}${dropTarget ? ' drop-target' : ''}`

  return (
    <div
      className={className}
      onClick={() => void openBook(book.id)}
      title={book.title}
      draggable={draggable}
      onDragStart={draggable ? () => onDragStart(book.id) : undefined}
      onDragEnter={draggable ? () => onDragEnterCard(book.id) : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={draggable ? (e) => {
        e.preventDefault()
        onDropCard(book.id)
      } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
    >
      <div className="book-cover">
        {book.cover ? (
          <img className="book-cover-img" src={book.cover} alt="" draggable={false} />
        ) : (
          <span className="book-cover-mark">❄</span>
        )}
      </div>
      <div className="book-meta">
        <div className="book-title">{book.title}</div>
        <div className="book-sub">
          {book.chapterCount}개 챕터 · {fmtDate(book.updatedAt)}
        </div>
      </div>
      <div className="book-tools" onClick={(e) => e.stopPropagation()}>
        <button onClick={onSetCover} title={book.cover ? '표지 변경' : '표지 지정'}>
          🖼
        </button>
        {book.cover && (
          <button onClick={(e) => void onRemoveCover(e)} title="표지 제거">
            ⊘
          </button>
        )}
        <button onClick={(e) => void onRename(e)} title="이름 변경">
          ✎
        </button>
        <button className="danger" onClick={(e) => void onDelete(e)} title="삭제">
          🗑
        </button>
      </div>
    </div>
  )
}

export function Library(): React.ReactElement {
  const library = useStore((s) => s.library)
  const loading = useStore((s) => s.loadingLibrary)
  const createBook = useStore((s) => s.createBook)
  const chooseLibraryDir = useStore((s) => s.chooseLibraryDir)
  const revealLibrary = useStore((s) => s.revealLibrary)
  const reorderBooks = useStore((s) => s.reorderBooks)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('manual')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  async function onNew(): Promise<void> {
    const title = await openPrompt({
      title: '새 소설 만들기',
      defaultValue: '무제',
      placeholder: '소설 제목',
      confirmLabel: '만들기'
    })
    if (!title) return
    setCreating(true)
    try {
      await createBook(title)
    } finally {
      setCreating(false)
    }
  }

  const allBooks = library?.books ?? []

  // 검색어(제목) 필터 → 정렬. 수동 정렬은 서버 순서(order/최근순)를 그대로 쓴다.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? allBooks.filter((b) => b.title.toLowerCase().includes(q)) : allBooks
    const arr = [...filtered]
    if (sort === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
    else if (sort === 'recent') arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    else if (sort === 'oldest') arr.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    return arr
  }, [allBooks, query, sort])

  // 드래그 재정렬은 수동 정렬 + 검색 없음일 때만(부분 목록 재배치 혼란 방지).
  const canReorder = sort === 'manual' && query.trim() === ''

  function onDropCard(targetId: string): void {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setOverId(null)
      return
    }
    const ids = shown.map((b) => b.id)
    const without = ids.filter((id) => id !== dragId)
    const at = without.indexOf(targetId)
    without.splice(at < 0 ? without.length : at, 0, dragId)
    setDragId(null)
    setOverId(null)
    void reorderBooks(without)
  }

  return (
    <div className="library">
      <header className="lib-header">
        <div className="lib-brand">
          <img className="lib-mark" src={iconUrl} alt="ICEFiction" />
          <div>
            <h1>ICEFiction</h1>
            <div className="lib-tagline">내 서재</div>
          </div>
        </div>
        <div className="lib-path" title={library?.dir}>
          <span className="lib-path-label">서재</span>
          <span className="lib-path-value">{library?.dir ?? '…'}</span>
          <button onClick={() => void revealLibrary()} title="서재 폴더 열기">
            📁
          </button>
          <button onClick={() => void chooseLibraryDir()}>서재 변경</button>
        </div>
      </header>

      <div className="lib-toolbar">
        <button className="lib-new" onClick={() => void onNew()} disabled={creating}>
          + 새 소설
        </button>
        <input
          className="lib-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 검색"
        />
        <select
          className="lib-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          title="정렬"
        >
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="lib-count">
          {query.trim() ? `${shown.length}/${allBooks.length}권` : `${allBooks.length}권`}
        </span>
      </div>

      <div className="lib-shelf">
        {loading ? (
          <div className="lib-empty">서재를 여는 중…</div>
        ) : allBooks.length === 0 ? (
          <div className="lib-empty">
            아직 책이 없습니다.
            <br />
            <span>“+ 새 소설”로 첫 이야기를 시작하세요.</span>
          </div>
        ) : shown.length === 0 ? (
          <div className="lib-empty">
            “{query}”에 맞는 책이 없습니다.
          </div>
        ) : (
          shown.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              draggable={canReorder}
              dragging={dragId === b.id}
              dropTarget={canReorder && overId === b.id && dragId !== b.id}
              onDragStart={setDragId}
              onDragEnterCard={setOverId}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onDropCard={onDropCard}
            />
          ))
        )}
      </div>
    </div>
  )
}
