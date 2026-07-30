/**
 * 보기·집필 환경 설정 패널 — 줄번호/테마/글꼴/글자크기/줄간격/색(BLUEPRINT §8.1).
 * 값은 useSettings(localStorage)에 저장되고 applySettings로 CSS 변수에 즉시 반영된다.
 */
import {
  effectiveColors,
  firstLineOffsets,
  FONTS,
  THEMES,
  useSettings,
  type FirstLineMode,
  type TextAlign,
  type ThemeKey
} from '../state/settings'
import { getEditorView } from '../lib/editorBridge'
import { alignSelection } from '../lib/editorCommands'
import { useHelp } from '../ui/help'
import { NumberField } from './NumberField'
import type { BlockAlign } from '../../../shared/align'

/** 문단 정렬 버튼 — 좌/가운데/우/양쪽(§8.1). hint = 선택 문단 정렬 단축키. */
const ALIGN_OPTIONS: { value: TextAlign; label: string; glyph: string; hint: string }[] = [
  { value: 'left', label: '왼쪽', glyph: '◂', hint: 'Ctrl+Shift+L' },
  { value: 'center', label: '가운데', glyph: '≡', hint: 'Ctrl+Shift+E' },
  { value: 'right', label: '오른쪽', glyph: '▸', hint: 'Ctrl+Shift+R' },
  { value: 'justify', label: '양쪽', glyph: '☰', hint: 'Ctrl+Shift+J' }
]

/** 에디터에서 드래그한 부분에만 정렬을 적용한다(원고 파일에 <div align>으로 기록). */
function applyAlign(align: BlockAlign | null): void {
  const view = getEditorView()
  if (!view) return
  alignSelection(view, align)
}

/** 문단 첫 줄 모양 — 들여쓰기와 내어쓰기는 같은 축이라 셋 중 하나만 고른다(§8.1). */
const FIRSTLINE_OPTIONS: { value: FirstLineMode; label: string; glyph: string; hint: string }[] = [
  { value: 'none', label: '없음', glyph: '▤', hint: '첫 줄도 나머지 줄과 나란히' },
  { value: 'indent', label: '들여쓰기', glyph: '↦', hint: '첫 줄만 안으로 — 소설 조판의 기본' },
  { value: 'hang', label: '내어쓰기', glyph: '↤', hint: '첫 줄만 밖으로, 나머지 줄이 안으로' }
]

/**
 * 문법 도움말은 **상단바 ? 아이콘(F1)**의 도움말 창으로 옮겼다(§8.1).
 * 여기 접혀 있던 치트시트는 보기 설정을 열어야만 보였고, 마크다운 표준 문법과 이 앱만의 규칙
 * (전각 공백 들여쓰기·Shift+Enter·불릿 `--`·`<u>` 밑줄)을 함께 설명할 자리가 없었다.
 */
function HelpLink(): React.ReactElement {
  return (
    <div className="vs-mdhelp">
      <button className="vs-help-open" onClick={() => useHelp.getState().show()}>
        📖 문법·단축키 도움말 열기
      </button>
      <p className="vs-mdhelp-note">
        상단바의 <b>?</b> 아이콘이나 <kbd>F1</kbd>으로도 열립니다. 커서가 없는 줄은 기호가 숨겨져
        결과처럼 보입니다(라이브 프리뷰).
      </p>
    </div>
  )
}

export function ViewSettings(): React.ReactElement {
  const s = useSettings()
  const colors = effectiveColors(s)

  return (
    <div className="viewset">
      <div className="vs-field">
        <span>앱 모드 — 도구창 전체 밝기 (워드/노션처럼)</span>
        <div className="vs-appmode">
          <button
            className={s.appMode === 'light' ? 'active' : ''}
            onClick={() => s.patch({ appMode: 'light' })}
          >
            ☀ 라이트
          </button>
          <button
            className={s.appMode === 'dark' ? 'active' : ''}
            onClick={() => s.patch({ appMode: 'dark' })}
          >
            ☾ 다크
          </button>
        </div>
      </div>

      <label className="vs-row vs-switch">
        <span>줄번호</span>
        <input
          type="checkbox"
          checked={s.showLineNumbers}
          onChange={(e) => s.patch({ showLineNumbers: e.target.checked })}
        />
      </label>

      <div className="vs-field">
        <span>집필 테마 — 원고 종이 배경 (도구창은 항상 어두운 톤)</span>
        <div className="vs-themes">
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
            <button
              key={key}
              className={`vs-theme${s.theme === key && !s.customBg && !s.customText ? ' active' : ''}`}
              style={{ background: THEMES[key].bg, color: THEMES[key].text }}
              onClick={() => s.setTheme(key)}
            >
              {THEMES[key].label}
            </button>
          ))}
        </div>
      </div>

      <label className="vs-field">
        <span>글꼴</span>
        <select value={s.fontKey} onChange={(e) => s.patch({ fontKey: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <NumberField
        label="글자 크기"
        unit="px"
        value={s.fontSizePx}
        min={13}
        max={26}
        step={1}
        onChange={(v) => s.patch({ fontSizePx: v })}
      />

      <NumberField
        label="줄 간격"
        value={s.lineHeight}
        min={1.4}
        max={2.6}
        step={0.1}
        onChange={(v) => s.patch({ lineHeight: v })}
      />

      <div className="vs-field">
        <span>문단 정렬 — 문서 전체 기본값</span>
        <div className="vs-align vs-align-doc">
          {ALIGN_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={s.textAlign === o.value ? 'active' : ''}
              onClick={() => s.patch({ textAlign: o.value })}
              title={o.label}
            >
              <span className="vs-align-glyph">{o.glyph}</span>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <NumberField
        label={`문단 간격${s.paraGapEm === 0 ? ' (없음)' : ''}`}
        unit="em"
        value={s.paraGapEm}
        min={0}
        max={2}
        step={0.1}
        hint="문단 사이가 벌어집니다 — 빈 줄을 넣으려고 엔터를 두 번 치지 않아도 됩니다."
        onChange={(v) => s.patch({ paraGapEm: v })}
      />

      {/* 연속 대사 붙이기 — 문단 간격의 예외 규칙이라 바로 아래에 둔다. */}
      <div className="vs-field">
        <label className="vs-row vs-switch">
          <span>대사가 이어질 땐 붙이기</span>
          <input
            type="checkbox"
            checked={s.tightDialogue}
            onChange={(e) => s.patch({ tightDialogue: e.target.checked })}
          />
        </label>
        <span className="insp-hint">
          따옴표로 시작하는 줄이 연달아 나오면 그 사이 문단 간격을 없앱니다. 서술에서 넘어오는 첫
          대사와, 서술로 돌아가는 마지막 대사 뒤는 그대로 벌어집니다.
        </span>
        {/* 설정과 결과가 같은 화면에 — 켜고 끄면 이 예시가 바로 붙고 떨어진다. */}
        <div
          className="vs-preview vs-preview-dialogue"
          style={{ background: colors.bg, color: colors.text, textAlign: s.textAlign }}
        >
          <p className="vs-preview-p" style={{ marginBottom: `${s.paraGapEm}em` }}>
            그는 문을 열었다.
          </p>
          <p className="vs-preview-p" style={{ marginBottom: s.tightDialogue ? 0 : `${s.paraGapEm}em` }}>
            &quot;어서 와.&quot;
          </p>
          <p className="vs-preview-p" style={{ marginBottom: `${s.paraGapEm}em` }}>
            &quot;오래 기다렸어?&quot;
          </p>
          <p className="vs-preview-p">우산에서 물이 떨어졌다.</p>
        </div>
      </div>

      <div className="vs-field">
        <span>문단 첫 줄</span>
        <div className="vs-align vs-align-doc">
          {FIRSTLINE_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={s.firstLineMode === o.value ? 'active' : ''}
              onClick={() => s.patch({ firstLineMode: o.value })}
              title={o.hint}
            >
              <span className="vs-align-glyph">{o.glyph}</span>
              {o.label}
            </button>
          ))}
        </div>
        {s.firstLineMode !== 'none' && (
          <NumberField
            label={`${s.firstLineMode === 'indent' ? '들여쓰기' : '내어쓰기'} 폭`}
            unit="em"
            value={s.firstLineEm}
            min={0.5}
            max={3}
            step={0.5}
            onChange={(v) => s.patch({ firstLineEm: v })}
          />
        )}
        <span className="insp-hint">
          보기 설정입니다 — 원고 파일에는 공백이 들어가지 않습니다. 실제 글자로 넣으려면 Tab(전각
          공백 한 칸)을 쓰세요.
        </span>
      </div>

      <div className="vs-field">
        <span>선택한 부분만 정렬 — 드래그로 고른 문단</span>
        <div className="vs-align vs-align-sel">
          {ALIGN_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => applyAlign(o.value as BlockAlign)}
              title={`선택한 문단을 ${o.label} 정렬 (${o.hint})`}
            >
              <span className="vs-align-glyph">{o.glyph}</span>
              {o.label}
            </button>
          ))}
        </div>
        <button className="vs-reset" onClick={() => applyAlign(null)}>
          선택 부분 정렬 해제 (Ctrl+Shift+0)
        </button>
        <span className="insp-hint">
          원고에 <code>&lt;div align="…"&gt;</code>로 기록됩니다 — 깃허브·옵시디언 등 다른 앱에서도
          그대로 정렬돼 보입니다.
        </span>
      </div>

      {/* 쓰기 도우미 — 원고를 고치는 동작이라 보기(화면) 설정과 구분해 묶어 둔다. */}
      <div className="vs-field">
        <span>쓰기 도우미</span>
        <label className="vs-row vs-switch">
          <span>따옴표 자동 짝</span>
          <input
            type="checkbox"
            checked={s.autoPairQuotes}
            onChange={(e) => s.patch({ autoPairQuotes: e.target.checked })}
          />
        </label>
        <label className="vs-row vs-switch">
          <span>
            줄 앞 <code>--</code> → 불릿 <code>•</code>
          </span>
          <input
            type="checkbox"
            checked={s.dashBullet}
            onChange={(e) => s.patch({ dashBullet: e.target.checked })}
          />
        </label>
        <span className="insp-hint">
          따옴표를 치면 닫는 짝까지 들어가고 커서가 안으로 갑니다(닫을 때 한 번 더 치면 건너뜁니다).
          줄 앞에서 <code>-</code>를 두 번이면 불릿, 세 번이면 가로 구분선(<code>---</code>)입니다.
        </span>
      </div>

      <div className="vs-field">
        <span>색 직접 고르기</span>
        <div className="vs-colors">
          <label className="vs-color">
            <input
              type="color"
              value={colors.text}
              onChange={(e) => s.patch({ customText: e.target.value })}
            />
            글자색
          </label>
          <label className="vs-color">
            <input
              type="color"
              value={colors.bg}
              onChange={(e) => s.patch({ customBg: e.target.value })}
            />
            배경색
          </label>
        </div>
        {(s.customBg || s.customText) && (
          <button className="vs-reset" onClick={() => s.resetColors()}>
            테마 기본색으로
          </button>
        )}
      </div>

      {/* 미리보기 — 글꼴·정렬만이 아니라 문단 간격·첫 줄 모양까지 그대로 보여 준다(설정과 결과가 같은 화면). */}
      <div
        className="vs-preview"
        style={{
          background: colors.bg,
          color: colors.text,
          fontFamily: FONTS.find((f) => f.key === s.fontKey)?.stack,
          textAlign: s.textAlign
        }}
      >
        {['비가 쏟아지기 시작했다. 그는 처마 밑으로 몸을 붙였다.', '멀리서 자동차 한 대가 지나갔다.'].map(
          (line) => (
            <p
              key={line}
              className="vs-preview-p"
              style={{
                marginBottom: `${s.paraGapEm}em`,
                textIndent: firstLineOffsets(s).indent,
                paddingLeft: firstLineOffsets(s).pad
              }}
            >
              {line}
            </p>
          )
        )}
      </div>

      <HelpLink />
    </div>
  )
}
