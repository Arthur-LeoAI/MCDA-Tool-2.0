import { useState } from 'react'
import { formatNumber, parseNumber } from '../lib/number'

/**
 * Text input for numbers that keeps what the user types (e.g. "0," or "-")
 * while reporting the parsed value; invalid or empty input reports null.
 */
export function NumberInput({
  value,
  onCommit,
  label,
  className = '',
  validClassName = 'border-slate-300 bg-white focus:border-accent-500',
  invalidClassName = 'border-red-300 bg-red-50',
  emptyClassName,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  label: string
  className?: string
  validClassName?: string
  invalidClassName?: string
  /** Style while empty; defaults to the invalid style (empty is not allowed). */
  emptyClassName?: string
}) {
  const [text, setText] = useState(formatNumber(value))
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(value)
  // Follow outside changes (sliders, imports) unless the user is typing here.
  if (!focused && value !== shown) {
    setShown(value)
    setText(formatNumber(value))
  }
  const parsed = parseNumber(text)
  const invalid = parsed === 'invalid' || parsed === null
  const stateClass =
    parsed === null && emptyClassName !== undefined ? emptyClassName : invalid ? invalidClassName : validClassName

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value)
        const next = parseNumber(e.target.value)
        onCommit(next === 'invalid' ? null : next)
      }}
      className={`focus:ring-accent-500/40 rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:ring-2 focus:outline-none ${
        stateClass
      } ${className}`}
    />
  )
}
