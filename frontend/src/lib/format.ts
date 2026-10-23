export const formatScore = (value: number) => (Math.abs(value) >= 1000 ? value.toFixed(0) : value.toPrecision(4))

export const formatPercent = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`

/** Categorical palette for alternatives and criteria (cycles beyond its length). */
export const PALETTE = [
  '#4f46e5',
  '#0891b2',
  '#16a34a',
  '#ea580c',
  '#db2777',
  '#7c3aed',
  '#ca8a04',
  '#0d9488',
  '#dc2626',
  '#2563eb',
  '#65a30d',
  '#c026d3',
  '#475569',
  '#9333ea',
  '#059669',
  '#d97706',
]

export const colorAt = (index: number) => PALETTE[index % PALETTE.length]
