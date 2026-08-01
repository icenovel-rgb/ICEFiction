/**
 * 책 전체 검색 패널(BLUEPRINT §6.9) — 오른쪽 '검색' 탭. Ctrl+Shift+F로 연다.
 *
 * 입력 디바운스 → search:all IPC(메인 프로세스 실시간 스캔, 설계 결정 D1) → 문서별 그룹.
 * 결과 클릭 = store.jumpTo — 문서를 열고 그 위치를 선택·중앙 스크롤(타이밍 규칙은 store 주석).
 *
 * **모두 바꾸기**(§6.9) — 임시로 써 둔 이름을 진짜 이름으로 한 번에 고치는 일은 소설에서 가장 흔한
 * 대량 수정이다. 예전엔 되돌릴 방법이 없어 뺐었지만(결정 D2), 이제 앱이 바꾸기 직전 원본을
 * `.backups/`에 남겨 되돌릴 거리를 만든다. 실행 전에는 **몇 문서에서 몇 곳이 바뀌는지** 확인받는다.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReplaceAllResult, SearchAllResult } from '../../../shared/types'
import { useStore } from '../state/store'
import { openConfirm } from '../ui/dialogs'

const SECTION_LABEL: Record<string, string> = {
  manuscript: '원고',
  characters: '캐릭터',
  world: '세계관',
  notes: '노트',
  style: '문체'
}

const DEBOUNCE_MS = 250

interface Props {
  /** Ctrl+Shift+F를 누를 때마다 증가 — 이미 열려 있어도 입력창에 다시 포커스를 준다. */
  focusToken: number
}

export function SearchPanel({ focusToken }: Props): React.ReactElement {
  const jumpTo = useStore((s) => s.jumpTo)
  const replaceAll = useStore((s) => s.replaceAll)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [result, setResult] = useState<SearchAllResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [done, setDone] = useState<ReplaceAllResult | null>(null)
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

  // 검색어를 고치면 지난 바꾸기 결과는 흘려보낸다(옛 결과가 새 검색과 겹쳐 보이지 않게).
  useEffect(() => setDone(null), [query, replacement])

  /**
   * 모두 바꾸기 — 되돌리기가 어려운 조작이라 **숫자를 보여 주고 확인을 받는다**.
   * 확인 문구에 문서 수·건수·백업 사실을 모두 적는다(무슨 일이 일어나는지 모른 채 누르지 않도록).
   */
  async function onReplaceAll(): Promise<void> {
    const q = query.trim()
    if (!q || !result || result.totalMatches === 0 || replacing) return
    const withMatches = result.files.filter((f) => f.matches.length > 0)
    if (withMatches.length === 0) return
    const ok = await openConfirm({
      title: '책 전체에서 모두 바꾸기',
      message:
        `“${q}” → “${replacement}”\n\n` +
        `문서 ${withMatches.length}개에서 ${result.totalMatches}곳을 바꿉니다.\n` +
        (result.truncated ? '⚠ 결과가 상한에 걸려 잘렸습니다 — 남는 것이 있을 수 있습니다.\n' : '') +
        '바꾸기 직전 원본은 책 폴더의 .backups/ 안에 남습니다(Ctrl+Z로는 못 되돌립니다).',
      confirmLabel: '모두 바꾸기'
    })
    if (!ok) return
    setReplacing(true)
    try {
      const res = await replaceAll(q, replacement, { caseSensitive })
      setDone(res)
      // 바꾼 뒤엔 같은 말이 남아 있지 않은지 그 자리에서 다시 훑는다(결과 목록이 비면 성공).
      const again = await window.api.searchAll(q, { caseSensitive })
      setResult(again)
    } finally {
      setReplacing(false)
    }
  }

  const canReplace = !!result && result.totalMatches > 0 && !searching && !replacing

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

      {/* 바꾸기 줄 — 찾기 바로 아래에 둔다(워드·VS Code와 같은 자리라 손이 먼저 간다). */}
      <div className="search-head search-replace-row">
        <input
          className="search-replace"
          type="text"
          placeholder="바꿀 말 (비우면 지웁니다)"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && canReplace) void onReplaceAll()
          }}
          spellCheck={false}
        />
        <button
          className="search-replace-all"
          onClick={() => void onReplaceAll()}
          disabled={!canReplace}
          title="책 전체에서 모두 바꾸기 — 원본은 .backups/에 남습니다"
        >
          {replacing ? '바꾸는 중…' : '모두 바꾸기'}
        </button>
      </div>

      {done && done.totalReplaced > 0 && (
        <div className="search-replaced" role="status">
          ✓ 문서 {done.files.length}개에서 {done.totalReplaced}곳을 바꿨습니다.
          <br />
          되돌리려면 책 폴더의 <code>{done.backupDir}</code> 안 파일을 제자리에 덮어쓰세요.
        </div>
      )}

      {query.trim() === '' ? (
        <p className="search-hint">
          원고·캐릭터·세계관·노트·문체 전체에서 찾고, 한 번에 바꿉니다.
          <br />
          현재 문서 안에서만 찾기·바꾸기는 에디터에서 Ctrl+F.
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
