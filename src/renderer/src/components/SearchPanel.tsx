/**
 * 책 전체 검색 패널(BLUEPRINT §6.9) — 오른쪽 '검색' 탭. Ctrl+Shift+F로 연다.
 *
 * 입력 디바운스 → search:all IPC(메인 프로세스 실시간 스캔, 설계 결정 D1) → 문서별 그룹.
 * 결과 클릭 = store.jumpTo — 문서를 열고 그 위치를 선택·중앙 스크롤(타이밍 규칙은 store 주석).
 * 바꾸기는 없다(설계 결정 D2 — 스냅샷 안전망 전까지 다중 파일 치환 금지).
 */
import { useEffect, useRef, useState } from 'react'
import type { SearchAllResult } from '../../../shared/types'
import { useStore } from '../state/store'

const SECTION_LABEL: Record<string, string> = {
  manuscript: '원고',
  characters: '캐릭터',
  world: '세계관',
  notes: '노트'
}

const DEBOUNCE_MS = 250

interface Props {
  /** Ctrl+Shift+F를 누를 때마다 증가 — 이미 열려 있어도 입력창에 다시 포커스를 준다. */
  focusToken: number
}

export function SearchPanel({ focusToken }: Props): React.ReactElement {
  const jumpTo = useStore((s) => s.jumpTo)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [result, setResult] = useState<SearchAllResult | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0) // 응답 역전 방지 — 마지막 요청만 반영

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusToken])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResult(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++seqRef.current
    const timer = setTimeout(() => {
      void window.api.searchAll(q, { caseSensitive }).then((r) => {
        if (seq !== seqRef.current) return // 뒤늦게 온 옛 응답은 버린다
        setResult(r)
        setSearching(false)
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, caseSensitive])

  return (
    <div className="search-panel">
      <div className="search-head">
        <input
          ref={inputRef}
          type="text"
          placeholder="책 전체에서 찾기…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
        <label className="search-case" title="대소문자 구분">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Aa
        </label>
      </div>

      {query.trim() === '' ? (
        <p className="search-hint">
          원고·캐릭터·세계관·노트 전체에서 찾습니다.
          <br />
          현재 문서 안에서만 찾으려면 에디터에서 Ctrl+F.
        </p>
      ) : searching ? (
        <p className="search-hint">찾는 중…</p>
      ) : !result || result.files.length === 0 ? (
        <p className="search-hint">결과 없음</p>
      ) : (
        <div className="search-results">
          <div className="search-summary">
            {result.totalMatches}건 · 문서 {result.files.length}개
            {result.truncated && ' (상한 도달 — 검색어를 좁혀 보세요)'}
          </div>
          {result.files.map((f) => (
            <div key={f.path} className="search-file">
              <button
                className="search-file-head"
                onClick={() => void jumpTo(f.path, f.matches[0]?.from ?? 0, f.matches[0]?.to ?? 0)}
                title={f.path}
              >
                <span className="search-file-section">{SECTION_LABEL[f.section] ?? f.section}</span>
                <span className="search-file-title">
                  {f.title}
                  {f.titleMatch && <span className="search-title-hit"> · 제목 일치</span>}
                </span>
                <span className="search-file-count">{f.matches.length || ''}</span>
              </button>
              {f.matches.map((m, i) => (
                <button
                  key={`${m.from}-${i}`}
                  className="search-match"
                  onClick={() => void jumpTo(f.path, m.from, m.to)}
                >
                  <span className="search-line">{m.line}</span>
                  <span className="search-preview">
                    {m.preview.slice(0, m.previewFrom)}
                    <mark>{m.preview.slice(m.previewFrom, m.previewTo)}</mark>
                    {m.preview.slice(m.previewTo)}
                  </span>
                </button>
              ))}
              {f.truncated && <div className="search-more">…이 문서엔 매치가 더 있습니다</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
