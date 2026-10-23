/** Accepts "12.5" and the decimal comma "12,5"; empty means no value yet. */
export function parseNumber(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (!trimmed) return null
  const value = Number(trimmed.replace(',', '.'))
  return Number.isFinite(value) ? value : 'invalid'
}

/** Shortest readable form, without float noise such as 0.30000000000000004. */
export const formatNumber = (value: number | null) => (value === null ? '' : String(Number(value.toPrecision(10))))
