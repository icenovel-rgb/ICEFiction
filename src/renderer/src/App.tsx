/**
 * 앱 셸 — 라우팅(BLUEPRINT §8). 열린 책이 없으면 책장(서재), 있으면 워크스페이스.
 * 워크스페이스: 상단바(← 서재) + 바인더 | 에디터 | 인스펙터 + 상태바.
 * 파일 드래그드롭 → assets 반입(§6.10).
 */
import { useEffect, useRef, useState } from 'react'
import { AiPanel } from './components/AiPanel'
import { AssetPicker } from './components/AssetPicker'
import { AssetsPanel } from './components/AssetsPanel'
import { Binder } from './components/Binder'
import { DialogHost } from './components/DialogHost'
import { Editor } from './components/Editor'
import { Inspector } from './components/Inspector'
import { Library } from './components/Library'
import { Lightbox } from './components/Lightbox'
import { StatusBar } from './components/StatusBar'
import { ViewSettings } from './components/ViewSettings'
import { useStore } from './state/store'
import { applySettings, useSettings } from './state/settings'

export function App(): React.ReactElement {
  const project = useStore((s) => s.project)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const settings = useSettings()
  const [zoomPct, setZoomPct] = useState<number | null>(null)

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  // 설정을 CSS 변수로 반영(테마·글꼴·줄번호). 변경 시마다 즉시 적용.
  useEffect(() => {
    applySettings(settings)
  }, [settings])

  // UI 확대/축소 — Ctrl +/- / 0, Ctrl+휠. 프레임 줌이라 본문까지 함께 커진다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const show = (factor: number): void => {
      setZoomPct(Math.round(factor * 100))
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setZoomPct(null), 1100)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        show(window.api.zoomBy(0.1))
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        show(window.api.zoomBy(-0.1))
      } else if (e.key === '0') {
        e.preventDefault()
        show(window.api.zoomReset())
      }
    }
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      show(window.api.zoomBy(e.deltaY < 0 ? 0.1 : -0.1))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <>
      {project ? <Workspace /> : <Library />}
      <DialogHost />
      <AssetPicker />
      <Lightbox />
      {zoomPct !== null && <div className="zoom-pill">{zoomPct}%</div>}
    </>
  )
}

function Workspace(): React.ReactElement {
  const project = useStore((s) => s.project)
  const closeBook = useStore((s) => s.closeBook)
  const ingest = useStore((s) => s.ingest)
  const binderOpen = useSettings((s) => s.binderOpen)
  const rightOpen = useSettings((s) => s.rightOpen)
  const patch = useSettings((s) => s.patch)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [tab, setTab] = useState<'inspector' | 'assets' | 'ai' | 'view'>('inspector')

  // 집중 모드 = 양쪽 패널 접기. Ctrl+\ 로 토글(원고에만 집중해 글쓰기).
  const toggleFocus = (): void => {
    if (binderOpen || rightOpen) patch({ binderOpen: false, rightOpen: false })
    else patch({ binderOpen: true, rightOpen: true })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        toggleFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binderOpen, rightOpen])
  // dragenter/leave가 자식 요소마다 쌍으로 발생해 깜빡이므로 깊이를 세어 0이 될 때만 오버레이를 끈다.
  const dragDepth = useRef(0)

  // OS 파일 드래그일 때만 '자료 반입' 오버레이를 띄운다. 앱 내부 자료 드래그(썸네일·인라인 이미지 등)는 무시.
  const isFileDrag = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types || []).includes('Files')

  function onDragEnter(e: React.DragEvent): void {
    if (!isFileDrag(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  function onDragOver(e: React.DragEvent): void {
    if (!isFileDrag(e)) return
    e.preventDefault() // 드롭 허용
  }
  function onDragLeave(e: React.DragEvent): void {
    if (!isFileDrag(e)) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragging(false)
    }
  }
  async function onDrop(e: React.DragEvent): Promise<void> {
    dragDepth.current = 0
    setDragging(false)
    if (!isFileDrag(e)) return // 편집기가 처리하는 인앱 드래그는 여기서 무시(중복 반입 방지)
    e.preventDefault()
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.api.pathForFile(f))
      .filter(Boolean)
    if (paths.length === 0) return
    await ingest(paths)
    setToast(`자료 ${paths.length}개를 assets/에 반입했습니다`)
    setTimeout(() => setToast(null), 3000)
  }

  // 안전장치 — 드롭·드래그종료 어디서든 오버레이를 반드시 끈다(캡처 단계라 편집기가 stopPropagation 해도 먼저 실행).
  useEffect(() => {
    const reset = (): void => {
      dragDepth.current = 0
      setDragging(false)
    }
    window.addEventListener('drop', reset, true)
    window.addEventListener('dragend', reset, true)
    return () => {
      window.removeEventListener('drop', reset, true)
      window.removeEventListener('dragend', reset, true)
    }
  }, [])

  return (
    <div
      className="app"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => void onDrop(e)}
    >
      <header className="workspace-bar">
        <button className="ws-back" onClick={() => void closeBook()} title="서재로 돌아가기">
          ← 서재
        </button>
        <span className="ws-title">{project?.manifest.title}</span>
        <div className="ws-tools">
          <button
            className={binderOpen ? 'active' : ''}
            onClick={() => patch({ binderOpen: !binderOpen })}
            title="바인더(왼쪽) 접기/펼치기"
          >
            ◧
          </button>
          <button
            className={rightOpen ? 'active' : ''}
            onClick={() => patch({ rightOpen: !rightOpen })}
            title="오른쪽 패널 접기/펼치기"
          >
            ◨
          </button>
          <button className="ws-focus" onClick={toggleFocus} title="집중 모드 — 양쪽 패널 접기 (Ctrl+\\)">
            {binderOpen || rightOpen ? '⛶ 집중' : '⛶ 해제'}
          </button>
        </div>
      </header>
      <div className="main">
        {binderOpen && <Binder />}
        <div className="content">
          <Editor />
        </div>
        {rightOpen && (
        <div className="rightpanel">
          <div className="rightpanel-tabs">
            <button
              className={tab === 'inspector' ? 'active' : ''}
              onClick={() => setTab('inspector')}
            >
              인스펙터
            </button>
            <button className={tab === 'assets' ? 'active' : ''} onClick={() => setTab('assets')}>
              자료
            </button>
            <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
              AI
            </button>
            <button className={tab === 'view' ? 'active' : ''} onClick={() => setTab('view')}>
              보기
            </button>
          </div>
          <div className="rightpanel-body">
            {tab === 'inspector' ? (
              <Inspector />
            ) : tab === 'assets' ? (
              <AssetsPanel />
            ) : tab === 'ai' ? (
              <AiPanel />
            ) : (
              <ViewSettings />
            )}
          </div>
        </div>
        )}
      </div>
      <StatusBar />
      {dragging && <div className="drop-overlay">여기에 놓아 자료로 반입</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
