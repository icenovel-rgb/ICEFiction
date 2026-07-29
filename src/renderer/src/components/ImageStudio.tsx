/**
 * 이미지 스튜디오 — AI에게 그림을 시킨다(BLUEPRINT §7.6).
 *
 * 네 모드:
 *  · doc      캐릭터 얼굴·장소 삽화 → assets/images/에 저장 + 프론트매터 images에 첨부(갤러리 표지가 된다)
 *  · inline   본문 삽화(/삽화) → 커서 자리에 ![](경로)로 삽입
 *  · cover    책 표지 → **AI는 글자 없는 그림만 그리고, 제목은 앱이 내장 글꼴로 얹는다**
 *  · docCover 챕터(문서) 표지 → 책 표지와 **같은 방식**. 완성본은 assets/covers/, 원본 아트는 그 아래 숨김 폴더.
 *
 * 표지에서 제목을 앱이 얹는 이유:
 *  ① 프롬프트에 "book cover/title"이 있으면 모델이 가짜 영문 제목을 그려 넣는다(실측).
 *  ② 그림에 구워진 제목은 글꼴·크기·위치를 못 고치고, 한 글자만 바꿔도 통째로 다시 그려야 한다.
 * 그림(원본 아트)은 그대로 보관하므로, 제목만 바꿔 다시 조판하는 건 재생성 없이 즉시 된다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ImageEngine, ImageEngineInfo } from '../../../shared/types'
import {
  ASPECT_KEYS,
  ASPECTS,
  draftCoverPrompt,
  draftDocPrompt,
  type AspectRatio
} from '../../../shared/imagePrompt'
import { toStandardEmbed } from '../../../shared/mdEmbed'
import { useStore } from '../state/store'
import { FONTS } from '../state/settings'
import { useImageStudio } from '../ui/imageStudio'
import { getEditorView, insertOrReplace } from '../lib/editorBridge'
import { drawTitledCover, type TitlePos } from '../lib/coverCompose'
import { assetUrl } from '../lib/media'
import { NumberField } from './NumberField'

type Phase = 'setup' | 'running' | 'done' | 'error'

/** 비율 드롭다운 — 표는 shared/imagePrompt.ts가 정본(엔진이 못 맞추면 앱이 잘라 맞춘다). */
const RATIO_OPTIONS = ASPECT_KEYS.map((k) => ({ value: k, label: ASPECTS[k].label }))

/** 내장 글꼴만 제목에 쓴다 — PC에 없어도 같은 표지가 나온다. */
const TITLE_FONTS = FONTS.filter((f) => f.label.includes('✓'))

/**
 * 커서가 놓인 자리를 알려 준다 — 그림은 "지금 쓰고 있는 문단"을 그려야 한다(§7.6).
 * 스튜디오의 대상이 지금 열려 있는 문서일 때만 뜻이 있다. 없으면 undefined → 문서 앞부분으로 폴백.
 */
function cursorFor(path: string): number | undefined {
  if (useStore.getState().activePath !== path) return undefined
  return getEditorView()?.state.selection.main.head
}

/**
 * 스튜디오는 **열 때마다 새로 마운트한다**(key=대상).
 * 안 그러면 직전 세션의 artUrl이 남아, 캐릭터(ice-asset) 이미지에 표지용 crossOrigin이 걸려
 * CORS로 로드가 깨진다(실측). 상태를 물려받을 이유가 없는 모달이므로 통째로 갈아끼운다.
 */
export function ImageStudio(): React.ReactElement | null {
  const target = useImageStudio((s) => s.target)
  if (!target) return null
  const key =
    target.kind === 'cover' ? `cover:${target.bookId}` : `${target.kind}:${target.path}`
  return <Studio key={key} />
}

function Studio(): React.ReactElement | null {
  const target = useImageStudio((s) => s.target)
  const close = useImageStudio((s) => s.close)
  const bumpCover = useImageStudio((s) => s.bumpCover)
  const project = useStore((s) => s.project)
  const frontmatter = useStore((s) => s.frontmatter)
  const body = useStore((s) => s.body)
  const attachImage = useStore((s) => s.attachImage)
  const setFrontmatter = useStore((s) => s.setFrontmatter)
  const saveNow = useStore((s) => s.saveNow)
  const loadAssets = useStore((s) => s.loadAssets)
  const refreshTree = useStore((s) => s.refreshTree)
  const loadLibrary = useStore((s) => s.loadLibrary)

  const [engines, setEngines] = useState<ImageEngineInfo[]>([])
  const [engine, setEngine] = useState<ImageEngine | 'auto'>('auto')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('')
  const [ratio, setRatio] = useState<AspectRatio>('1:1')
  const [phase, setPhase] = useState<Phase>('setup')
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState('')
  const [artUrl, setArtUrl] = useState('') // 생성된 그림(표지=글자 없는 아트)
  const [artRel, setArtRel] = useState('') // 문서 표지 아트의 프로젝트 상대경로(프론트매터에 기록)
  const [bookTitle, setBookTitle] = useState('')

  // 표지 제목 조판
  const [title, setTitle] = useState('')
  const [titleOn, setTitleOn] = useState(true)
  const [titleFont, setTitleFont] = useState(TITLE_FONTS[0]?.key ?? 'nanummyeongjo')
  const [titleSize, setTitleSize] = useState(9) // 캔버스 폭 대비 %
  const [titleColor, setTitleColor] = useState('#ffffff')
  const [titlePos, setTitlePos] = useState<TitlePos>('top')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [saving, setSaving] = useState(false)

  const reqId = useRef('')
  const isBookCover = target?.kind === 'cover'
  const isDocCover = target?.kind === 'docCover'
  const hasTitle = isBookCover || isDocCover // 제목을 앱이 얹는 모드

  // 열릴 때 초안 프롬프트·스타일·엔진을 준비한다.
  useEffect(() => {
    if (!target) return
    setPhase('setup')
    setLog([])
    setError('')
    setArtUrl('')
    void window.api.imageEngines().then(setEngines)

    if (target.kind === 'cover') {
      setRatio('2:3')
      void window.api.getBookMeta(target.bookId).then((m) => {
        setBookTitle(m.title)
        setTitle(m.title)
        setStyle(m.imageStyle ?? '')
        setPrompt(draftCoverPrompt(m.title))
        if (m.coverArtUrl) {
          setArtUrl(m.coverArtUrl) // 이미 그려둔 아트가 있으면 제목만 다시 얹을 수 있다
          setPhase('done')
        }
      })
      return
    }

    const docTitle = frontmatter.title ?? target.path.split('/').pop()?.replace(/\.md$/, '') ?? ''
    setStyle(project?.manifest.imageStyle ?? '')
    setPrompt(
      draftDocPrompt({
        name: docTitle,
        type: frontmatter.type,
        synopsis: frontmatter.synopsis,
        body,
        cursor: cursorFor(target.path), // 문서 맨 앞이 아니라 **커서가 있는 문단**을 근거로
        aliases: frontmatter.aliases
      })
    )

    if (target.kind === 'docCover') {
      setRatio('3:4') // 갤러리 카드(3:4)에 꽉 차게
      setTitle(docTitle)
      if (frontmatter.coverArt) {
        // 이미 그려둔 아트가 있으면 다시 그리지 않고 제목만 재조판할 수 있다.
        setArtRel(frontmatter.coverArt)
        setArtUrl(window.api.docCoverUrl(frontmatter.coverArt, Date.now()))
        setPhase('done')
      }
    } else {
      setRatio(target.kind === 'inline' ? '16:9' : '1:1')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // 생성 이벤트 구독
  useEffect(() => {
    const offP = window.api.onImageProgress((d) => {
      if (d.requestId !== reqId.current) return
      setLog((l) => [...l.slice(-6), d.text])
    })
    const offD = window.api.onImageDone((d) => {
      if (d.requestId !== reqId.current) return
      setPhase('done')
      void (async () => {
        if (target?.kind === 'cover') {
          setArtUrl(`${d.url}&t=${Date.now()}`)
          await loadLibrary()
        } else if (target?.kind === 'docCover') {
          // 글자 없는 아트만 생겼다 — 제목은 아래에서 얹어 '이 표지로 저장'할 때 완성된다.
          setArtRel(d.path)
          setArtUrl(d.url)
        } else if (target?.kind === 'inline') {
          // 본문 삽화 — 커서 자리에 표준 마크다운으로 넣는다(문서 기준 상대경로 §6.10).
          insertOrReplace(`\n\n${toStandardEmbed(d.path, target.path)}\n\n`)
          setArtUrl(assetUrl(d.path))
          await loadAssets()
          await refreshTree()
        } else {
          // 문서 이미지 → 프론트매터에 첨부하면 인스펙터 썸네일·갤러리 표지가 된다
          attachImage(d.path)
          setArtUrl(assetUrl(d.path))
          await loadAssets()
          await refreshTree()
        }
      })()
    })
    const offE = window.api.onImageError((d) => {
      if (d.requestId !== reqId.current) return
      setPhase('error')
      setError(d.message + (d.detail ? `\n${d.detail.slice(0, 300)}` : ''))
    })
    return () => {
      offP()
      offD()
      offE()
    }
  }, [target, attachImage, loadAssets, refreshTree, loadLibrary])

  // 표지 미리보기 — 그림 위에 제목을 얹어 캔버스에 그린다(책 표지·챕터 표지 공용).
  useEffect(() => {
    if (!hasTitle || !artUrl || !canvasRef.current) return
    let cancelled = false
    void drawTitledCover(
      canvasRef.current,
      artUrl,
      { title, on: titleOn, fontKey: titleFont, sizePct: titleSize, color: titleColor, pos: titlePos },
      () => cancelled
    )
    return () => {
      cancelled = true
    }
  }, [hasTitle, artUrl, title, titleOn, titleFont, titleSize, titleColor, titlePos])

  const engineOptions = useMemo(
    () => [
      { value: 'auto' as const, label: '자동 (설치된 것부터)' },
      ...engines.map((e) => ({
        value: e.engine,
        label: `${e.engine}${e.ok ? '' : ' — 없음'}`
      }))
    ],
    [engines]
  )

  if (!target) return null
  const anyEngine = engines.some((e) => e.ok)

  function onGenerate(): void {
    if (!target) return
    reqId.current = `img-${Date.now()}`
    setPhase('running')
    setLog([])
    setError('')
    void window.api.generateImage({
      requestId: reqId.current,
      target,
      prompt,
      style: style.trim() || undefined,
      ratio,
      engine
    })
    // 스타일 바이블은 책에 저장해 다음 그림도 같은 화풍으로.
    if (target.kind === 'cover') void window.api.setBookImageStyle(target.bookId, style.trim())
  }

  function onCancel(): void {
    window.api.cancelImage(reqId.current)
    setPhase('setup')
  }

  /** 제목을 얹은 완성본을 저장한다 — 책 표지는 책 폴더로, 문서 표지는 프론트매터로. */
  async function onSaveCover(): Promise<void> {
    if (!target || !canvasRef.current) return
    setSaving(true)
    try {
      const data = canvasRef.current.toDataURL('image/png')
      if (target.kind === 'cover') {
        await window.api.setBookCoverData(target.bookId, data)
        await loadLibrary()
      } else if (target.kind === 'docCover') {
        const rel = await window.api.saveDocCover(target.path, data)
        // 프론트매터 기록은 렌더러가 한다 — main이 편집 중인 .md를 동시에 고치면 본문과 경합한다.
        setFrontmatter({ cover: rel, coverArt: artRel || undefined })
        await saveNow()
        await refreshTree()
        bumpCover() // 경로가 그대로라 캐시를 안 털면 옛 표지가 계속 보인다
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  const headTitle = isBookCover
    ? `표지 만들기 — ${bookTitle}`
    : isDocCover
      ? `표지 만들기 — ${title || '문서'}`
      : 'AI 이미지 생성'

  return (
    <div className="modal-backdrop" onClick={() => phase !== 'running' && close()}>
      <div className="studio" onClick={(e) => e.stopPropagation()}>
        <header className="studio-head">
          <span>{headTitle}</span>
          <button onClick={close} disabled={phase === 'running'}>
            ✕
          </button>
        </header>

        <div className="studio-body">
          <div className="studio-left">
            {!anyEngine && engines.length > 0 && (
              <div className="studio-warn">
                이미지 생성 CLI가 없습니다. <code>agy</code> 또는 <code>codex</code>를 설치하세요.
              </div>
            )}

            <label className="studio-field">
              <span>무엇을 그릴까요 (프롬프트)</span>
              <textarea
                rows={7}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={phase === 'running'}
              />
            </label>

            <label className="studio-field">
              <span>스타일 바이블 — 이 책의 모든 그림이 같은 화풍이 됩니다</span>
              <textarea
                rows={2}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="예: 느와르, 비 내리는 한국 도시, 청회색 팔레트, 회화적 사실주의"
                disabled={phase === 'running'}
              />
            </label>

            <div className="studio-row">
              <label className="studio-field">
                <span>엔진</span>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as ImageEngine | 'auto')}
                  disabled={phase === 'running'}
                >
                  {engineOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="studio-field">
                <span>비율</span>
                <select
                  value={ratio}
                  onChange={(e) => setRatio(e.target.value as AspectRatio)}
                  disabled={phase === 'running'}
                >
                  {RATIO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <span className="insp-hint">
              AI는 <b>글자 없는 그림</b>만 그립니다 — 표지라고 말하면 엉터리 글자를 그려 넣기
              때문입니다.{' '}
              {hasTitle &&
                '제목은 아래에서 앱이 얹습니다. 그림은 보관되니 제목·글꼴·위치는 다시 그리지 않고 언제든 고칠 수 있습니다.'}
            </span>

            {phase === 'running' ? (
              <div className="studio-actions">
                <div className="studio-log">
                  <span className="studio-spin">◐</span> 그리는 중… 보통 1~2분 걸립니다
                  {log.slice(-2).map((l, i) => (
                    <div key={i} className="studio-logline">
                      {l}
                    </div>
                  ))}
                </div>
                <button className="dialog-cancel" onClick={onCancel}>
                  중지
                </button>
              </div>
            ) : (
              <div className="studio-actions">
                <button className="dialog-confirm" onClick={onGenerate} disabled={!anyEngine}>
                  {artUrl ? '다시 그리기' : '그리기'}
                </button>
              </div>
            )}

            {phase === 'error' && <pre className="studio-error">{error}</pre>}
          </div>

          <div className="studio-right">
            {hasTitle ? (
              <>
                <canvas ref={canvasRef} className="studio-canvas" />
                {!artUrl && <div className="studio-blank">그림을 먼저 그리세요</div>}
                {artUrl && (
                  <div className="studio-title-controls">
                    <label className="vs-row vs-switch">
                      <span>제목 얹기</span>
                      <input
                        type="checkbox"
                        checked={titleOn}
                        onChange={(e) => setTitleOn(e.target.checked)}
                      />
                    </label>
                    <textarea
                      rows={2}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="표지에 넣을 제목 (줄바꿈 가능)"
                      disabled={!titleOn}
                    />
                    <div className="studio-row">
                      <select
                        value={titleFont}
                        onChange={(e) => setTitleFont(e.target.value)}
                        disabled={!titleOn}
                      >
                        {TITLE_FONTS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={titlePos}
                        onChange={(e) => setTitlePos(e.target.value as TitlePos)}
                        disabled={!titleOn}
                      >
                        <option value="top">위</option>
                        <option value="center">가운데</option>
                        <option value="bottom">아래</option>
                      </select>
                      <select
                        value={titleColor}
                        onChange={(e) => setTitleColor(e.target.value)}
                        disabled={!titleOn}
                      >
                        <option value="#ffffff">흰 글자</option>
                        <option value="#111111">검은 글자</option>
                      </select>
                    </div>
                    <NumberField
                      label="제목 크기"
                      unit="%"
                      value={titleSize}
                      min={4}
                      max={16}
                      step={1}
                      disabled={!titleOn}
                      onChange={setTitleSize}
                    />
                    <button
                      className="dialog-confirm"
                      onClick={() => void onSaveCover()}
                      disabled={saving}
                    >
                      {saving ? '저장 중…' : '이 표지로 저장'}
                    </button>
                  </div>
                )}
              </>
            ) : artUrl ? (
              <img className="studio-preview" src={artUrl} alt="" />
            ) : (
              <div className="studio-blank">그리면 여기 보입니다</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
