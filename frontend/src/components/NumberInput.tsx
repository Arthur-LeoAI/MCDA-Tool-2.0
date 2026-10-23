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
}: {
  value: number | null
  onCommit: (value: number | null) => void
  label: string
  className?: string
  validClassName?: string
  invalidClassName?: string
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
      className={`rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500/40 ${
        invalid ? invalidClassName : validClassName
      } ${className}`}
    />
  )
}
