/**
 * 책장(서재) — 홈 화면(ICEWriter 방식). 서재 경로 하나 안에 쌓인 책들을 카드로 보여주고,
 * "새 소설"은 서재 안에 폴더를 자동 생성한다. 파일 탐색기로 폴더를 고르는 일은 없다.
 */
import { useState } from 'react'
import type { BookSummary } from '../../../shared/types'
import { useStore } from '../state/store'
import { openConfirm, openPrompt } from '../ui/dialogs'
import iconUrl from '../assets/icon.png'

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ko', { year: '2-digit', month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}

function BookCard({ book }: { book: BookSummary }): React.ReactElement {
  const openBook = useStore((s) => s.openBook)
  const renameBook = useStore((s) => s.renameBook)
  const deleteBook = useStore((s) => s.deleteBook)

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

  return (
    <div className="book-card" onClick={() => void openBook(book.id)} title={book.title}>
      <div className="book-cover">
        <span className="book-cover-mark">❄</span>
      </div>
      <div className="book-meta">
        <div className="book-title">{book.title}</div>
        <div className="book-sub">
          {book.chapterCount}개 챕터 · {fmtDate(book.updatedAt)}
        </div>
      </div>
      <div className="book-tools" onClick={(e) => e.stopPropagation()}>
        <button onClick={onRename} title="이름 변경">
          ✎
        </button>
        <button className="danger" onClick={onDelete} title="삭제">
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
  const [creating, setCreating] = useState(false)

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

  const books = library?.books ?? []

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
        <span className="lib-count">{books.length}권</span>
      </div>

      <div className="lib-shelf">
        {loading ? (
          <div className="lib-empty">서재를 여는 중…</div>
        ) : books.length === 0 ? (
          <div className="lib-empty">
            아직 책이 없습니다.
            <br />
            <span>“+ 새 소설”로 첫 이야기를 시작하세요.</span>
          </div>
        ) : (
          books.map((b) => <BookCard key={b.id} book={b} />)
        )}
      </div>
    </div>
  )
}
