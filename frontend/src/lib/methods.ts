import type { MethodResult, ProjectMethod } from '../api/types'
import type { Translate } from '../i18n/useT'
import { formatScore } from './format'

/** Short, translated name of a method with its settings, e.g. "CP p=2 · from data". */
export function methodLabel(t: Translate, spec: ProjectMethod): string {
  if (spec.method === 'weighted_sum') return t('method.weighted_sum')
  if (spec.method === 'topsis') {
    const variant = spec.basis === 'raw' ? t('topsis.raw') : t(spec.ideal === 'fixed' ? 'ideal.fixed' : 'ideal.data')
    return `TOPSIS · ${variant}`
  }
  const p = spec.p === 'inf' ? '∞' : String(spec.p)
  return `CP p=${p} · ${t(spec.ideal === 'fixed' ? 'ideal.fixed' : 'ideal.data')}`
}

/** The weighted sum is shown on a 0–100 scale; other methods as computed. */
export const displayScale = (result: Pick<MethodResult, 'method'>) => (result.method === 'weighted_sum' ? 100 : 1)

/** A score as shown to users: weighted sum as 0–100 points with one decimal. */
export const formatResultScore = (result: Pick<MethodResult, 'method'>, score: number) =>
  result.method === 'weighted_sum' ? (score * 100).toFixed(1) : formatScore(score)
