/**
 * 수치 입력 — 슬라이더 하나로는 0.1 단위를 맞추기 어려워 **직접 입력**과 **위아래 화살표**를 함께 준다.
 *
 * 세 입력(슬라이더·숫자칸·화살표)이 shared/numstep의 같은 규칙을 쓰기 때문에 서로 어긋나지 않는다.
 * 타이핑 중에는 표기를 밖에서 덮어쓰지 않는다 — 지우고 다시 치는 동안 커서와 값이 튀지 않게.
 */
import { useEffect, useState } from 'react'
import { clampToStep, formatStep, parseStepInput, stepBy } from '../../../shared/numstep'

interface NumberFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  /** 숫자 뒤에 붙는 단위 표기(px·em 등). 값에는 영향이 없다. */
  unit?: string
  hint?: string
  disabled?: boolean
  onChange: (v: number) => void
}

export function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  disabled = false,
  onChange
}: NumberFieldProps): React.ReactElement {
  const [text, setText] = useState(() => formatStep(value, step))
  const [typing, setTyping] = useState(false)

  // 슬라이더·화살표로 값이 바뀌면 숫자칸 표기도 따라간다(타이핑 중일 때만 예외).
  useEffect(() => {
    if (!typing) setText(formatStep(value, step))
  }, [value, step, typing])

  /**
   * 값과 표기를 함께 바꾼다.
   * 표기까지 여기서 손대는 이유 — 숫자칸에 커서가 있는 동안에는 위 useEffect가 표기를 갱신하지
   * 않으므로(타이핑 보호), 화살표·슬라이더로 바꾼 값이 화면에 안 보이는 일이 생긴다.
   */
  const apply = (v: number): void => {
    setText(formatStep(v, step))
    if (v !== value) onChange(v)
  }
  const bump = (delta: number): void => apply(stepBy(value, delta, min, max, step))

  /**
   * 타이핑 중 반영은 "잘리지 않은 값"일 때만 한다.
   * 13~26 칸에 "18"을 넣으려고 "1"을 친 순간 13으로 튀지 않게 하려는 것 —
   * 잘린 입력은 확정(blur·Enter) 때 비로소 범위 안으로 붙는다.
   */
  const onText = (raw: string): void => {
    setText(raw)
    const parsed = parseStepInput(raw, min, max, step)
    if (parsed === null) return
    if (Number(raw.trim().replace(/,/g, '.')) === parsed && parsed !== value) onChange(parsed)
  }

  const confirm = (): void => {
    setTyping(false)
    const parsed = parseStepInput(text, min, max, step)
    apply(parsed ?? clampToStep(value, min, max, step))
  }

  return (
    <div className={`vs-field vs-num${disabled ? ' vs-num-off' : ''}`}>
      <div className="vs-num-head">
        <span>{label}</span>
        <span className="vs-num-ctrl">
          <input
            className="vs-num-input"
            type="text"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            aria-label={`${label} 값`}
            onFocus={() => setTyping(true)}
            onChange={(e) => onText(e.target.value)}
            onBlur={confirm}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                bump(1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                bump(-1)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                confirm()
              }
            }}
          />
          {unit && <span className="vs-num-unit">{unit}</span>}
          <span className="vs-num-arrows">
            <button
              type="button"
              disabled={disabled || value >= max}
              onClick={() => bump(1)}
              title={`${step} 올리기 (↑)`}
              aria-label={`${label} 올리기`}
            >
              ▴
            </button>
            <button
              type="button"
              disabled={disabled || value <= min}
              onClick={() => bump(-1)}
              title={`${step} 내리기 (↓)`}
              aria-label={`${label} 내리기`}
            >
              ▾
            </button>
          </span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={`${label} 슬라이더`}
        onChange={(e) => apply(clampToStep(Number(e.target.value), min, max, step))}
      />
      {hint && <span className="insp-hint">{hint}</span>}
    </div>
  )
}
