/**
 * 보기·집필 환경 설정 패널 — 줄번호/테마/글꼴/글자크기/줄간격/색(BLUEPRINT §8.1).
 * 값은 useSettings(localStorage)에 저장되고 applySettings로 CSS 변수에 즉시 반영된다.
 */
import { useState } from 'react'
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
import { alignSelection, unifyQuotes } from '../lib/editorCommands'
import { QUOTE_STYLE_LABEL, type QuoteStyle } from '../../../shared/quoteStyle'
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

/**
 * 따옴표 모양(§6.1c) — "같은 글꼴인데 왜 모양이 다르냐"에 대한 답과 해결을 한자리에 둔다.
 *
 * 원인은 글꼴이 아니라 **글자**다. 자판의 `"`(U+0022)와 출판용 `“ ”`(U+201C·U+201D)는 서로 다른
 * 글자이고, 손으로 친 대사와 AI가 쓴 대사가 섞이면서 한 원고 안에 두 글자가 함께 있게 된다.
 * 그래서 고르는 순간부터는 앞으로 치는 것이 그 모양이 되고, 이미 쓴 글은 단추로 한 번에 맞춘다.
 */
function QuoteStyleField(): React.ReactElement {
  const style = useSettings((s) => s.quoteStyle)
  const patch = useSettings((s) => s.patch)
  const [msg, setMsg] = useState<string | null>(null)

  function onUnify(): void {
    const view = getEditorView()
    if (!view) return
    if (style === 'keep') {
      setMsg('먼저 위에서 통일할 모양을 고르세요.')
      return
    }
    const n = unifyQuotes(view, style)
    setMsg(n === 0 ? '이 문서는 이미 한 모양입니다.' : `따옴표 ${n}개를 맞췄습니다. (Ctrl+Z로 되돌리기)`)
  }

  return (
    <div className="vs-quotestyle">
      <span className="vs-sub">따옴표 모양</span>
      <div className="vs-align vs-align-doc">
        {(Object.keys(QUOTE_STYLE_LABEL) as QuoteStyle[]).map((k) => (
          <button
            key={k}
            className={style === k ? 'active' : ''}
            onClick={() => {
              patch({ quoteStyle: k })
              setMsg(null)
            }}
            title={
              k === 'keep'
                ? '친 그대로 둡니다(지금까지의 동작)'
                : k === 'straight'
                  ? '자판 그대로의 곧은 따옴표'
                  : '출판물에서 쓰는 둥근 따옴표'
            }
          >
            {QUOTE_STYLE_LABEL[k]}
          </button>
        ))}
      </div>
      <button className="vs-reset" onClick={onUnify} disabled={style === 'keep'}>
        지금 문서의 따옴표 통일
      </button>
      {msg && <span className="vs-quotemsg">{msg}</span>}
      <span className="insp-hint">
        모양이 섞여 보이는 건 글꼴 탓이 아니라 <b>글자가 다르기 때문</b>입니다 — 자판의{' '}
        <code>&quot;</code>(U+0022)와 출판용 <code>“ ”</code>(U+201C·U+201D)는 서로 다른 글자입니다.
        손으로 친 대사와 AI가 쓴 대사가 섞이면 한 원고에 둘이 함께 남습니다. 모양을 고르면 앞으로
        치는 따옴표와 AI가 넣는 글이 그 모양으로 맞춰지고, 이미 쓴 글은 위 단추로 한 번에 바꿉니다.
        낫표(<code>「」</code>)는 건드리지 않습니다.
      </span>
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

      {/* 패널 배치 — 원고가 어디에 놓이는지를 정하므로 화면 설정 맨 앞쪽에 둔다(§8). */}
      <div className="vs-field">
        <label className="vs-row vs-switch">
          <span>원고를 화면 가운데 고정</span>
          <input
            type="checkbox"
            checked={s.centerPaper}
            onChange={(e) => s.patch({ centerPaper: e.target.checked })}
          />
        </label>
        <span className="insp-hint">
          한쪽 패널만 열어도 <b>쓰던 줄이 좌우로 밀리지 않습니다.</b> 열린 패널 반대쪽에 같은 만큼
          여백을 비워 두는 방식이라, 패널이 글자를 가리는 일은 없습니다. 창이 좁아 원고 폭이
          답답하면 끄세요 — 그때는 예전처럼 남은 자리를 원고가 다 씁니다.
        </span>
      </div>

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
          따옴표를 치면 닫는 짝까지 들어가고 커서가 안으로 갑니다. 대사를 다 썼으면{' '}
          <kbd>Enter</kbd>가 닫는 따옴표 <b>밖으로 나가</b> 다음 줄을 엽니다(닫는 부호를 또 치지
          않아도 됩니다). 줄 앞에서 <code>-</code>를 두 번이면 불릿, 세 번이면 가로 구분선(
          <code>---</code>)입니다.
        </span>
        <QuoteStyleField />
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
