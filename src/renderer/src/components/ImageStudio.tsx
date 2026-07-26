/**
 * 이미지 스튜디오 — AI에게 그림을 시킨다(BLUEPRINT §7.6).
 *
 * 두 모드:
 *  · doc   캐릭터 얼굴·장소 삽화 → assets/images/에 저장 + 프론트매터 images에 첨부(갤러리 표지가 된다)
 *  · cover 책 표지 → **AI는 글자 없는 그림만 그리고, 제목은 앱이 내장 글꼴로 얹는다**
 *
 * 표지에서 제목을 앱이 얹는 이유:
 *  ① 프롬프트에 "book cover/title"이 있으면 모델이 가짜 영문 제목을 그려 넣는다(실측).
 *  ② 그림에 구워진 제목은 글꼴·크기·위치를 못 고치고, 한 글자만 바꿔도 통째로 다시 그려야 한다.
 * 그림(cover-art.png)은 그대로 보관하므로, 제목만 바꿔 다시 조판하는 건 재생성 없이 즉시 된다.
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
import { FONTS, fontStack } from '../state/settings'
import { useImageStudio } from '../ui/imageStudio'
import { insertOrReplace } from '../lib/editorBridge'
import { assetUrl } from '../lib/media'

type Phase = 'setup' | 'running' | 'done' | 'error'
type TitlePos = 'top' | 'center' | 'bottom'

/** 비율 드롭다운 — 표는 shared/imagePrompt.ts가 정본(엔진이 못 맞추면 앱이 잘라 맞춘다). */
const RATIO_OPTIONS = ASPECT_KEYS.map((k) => ({ value: k, label: ASPECTS[k].label }))

/** 내장 글꼴만 제목에 쓴다 — PC에 없어도 같은 표지가 나온다. */
const TITLE_FONTS = FONTS.filter((f) => f.label.includes('✓'))

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
  const project = useStore((s) => s.project)
  const frontmatter = useStore((s) => s.frontmatter)
  const body = useStore((s) => s.body)
  const attachImage = useStore((s) => s.attachImage)
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
  const isCover = target?.kind === 'cover'

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
    } else {
      setRatio(target.kind === 'inline' ? '16:9' : '1:1')
      setStyle(project?.manifest.imageStyle ?? '')
      setPrompt(
        draftDocPrompt({
          name: frontmatter.title ?? '',
          type: frontmatter.type,
          synopsis: frontmatter.synopsis,
          body,
          aliases: frontmatter.aliases
        })
      )
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

  // 표지 미리보기 — 그림 위에 제목을 얹어 캔버스에 그린다.
  useEffect(() => {
    if (!isCover || !artUrl || !canvasRef.current) return
    let cancelled = false
    void (async () => {
      const img = new Image()
      // 캔버스 오염 방지 — 이게 없으면 toDataURL()이 SecurityError로 막힌다(ice-cover는 다른 오리진).
      img.crossOrigin = 'anonymous'
      img.src = artUrl
      await img.decode().catch(() => {})
      if (cancelled || !canvasRef.current) return
      const cv = canvasRef.current
      cv.width = img.naturalWidth || 1024
      cv.height = img.naturalHeight || 1536
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, cv.width, cv.height)
      if (!titleOn || !title.trim()) return

      const family = fontStack(titleFont)
      const px = Math.round((cv.width * titleSize) / 100)
      const font = `700 ${px}px ${family}`
      await document.fonts.load(font).catch(() => {}) // 내장 글꼴 로드 보장
      ctx.font = font
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = titleColor
      // 어떤 그림 위에서도 읽히게 — 부드러운 그림자.
      ctx.shadowColor = titleColor === '#ffffff' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.5)'
      ctx.shadowBlur = Math.round(px * 0.35)

      const lines = title.split('\n').map((l) => l.trim()).filter(Boolean)
      const lh = px * 1.3
      const blockH = lines.length * lh
      const cy =
        titlePos === 'top'
          ? cv.height * 0.16 + blockH / 2
          : titlePos === 'center'
            ? cv.height / 2
            : cv.height * 0.84 - blockH / 2
      lines.forEach((line, i) => {
        ctx.fillText(line, cv.width / 2, cy - blockH / 2 + lh / 2 + i * lh)
      })
    })()
    return () => {
      cancelled = true
    }
  }, [isCover, artUrl, title, titleOn, titleFont, titleSize, titleColor, titlePos])

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

  async function onSaveCover(): Promise<void> {
    if (!target || target.kind !== 'cover' || !canvasRef.current) return
    setSaving(true)
    try {
      const data = canvasRef.current.toDataURL('image/png')
      await window.api.setBookCoverData(target.bookId, data)
      await loadLibrary()
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => phase !== 'running' && close()}>
      <div className="studio" onClick={(e) => e.stopPropagation()}>
        <header className="studio-head">
          <span>{isCover ? `표지 만들기 — ${bookTitle}` : 'AI 이미지 생성'}</span>
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
              {isCover &&
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
            {isCover ? (
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
                    <label className="studio-field">
                      <span>제목 크기 — {titleSize}%</span>
                      <input
                        type="range"
                        min={4}
                        max={16}
                        value={titleSize}
                        onChange={(e) => setTitleSize(Number(e.target.value))}
                        disabled={!titleOn}
                      />
                    </label>
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
