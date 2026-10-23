// Turn error codes and structured locations into text in the user's language.
import type { DraftProblem, Issue, Location } from '../api/types'
import { errorMessages } from './errors'
import type { Language } from './messages'
import { translate } from './useT'

const fill = (text: string, params: Record<string, unknown>) =>
  text.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])))

/** Name the alternative/criterion behind 1-based row/column params, when the draft is known. */
function withNames(params: Record<string, unknown>, draft?: DraftProblem | null): Record<string, unknown> {
  const row = Number(params.row)
  const column = Number(params.column)
  return {
    ...params,
    alternative: params.alternative ?? draft?.alternatives[row - 1] ?? `#${params.row}`,
    criterion: params.criterion ?? draft?.criteria[column - 1]?.name ?? `#${params.column}`,
  }
}

/** Text for an error code; falls back to the server's English message for unknown codes. */
export function errorText(
  language: Language,
  code: string,
  params: Record<string, unknown> = {},
  fallback?: string,
  draft?: DraftProblem | null,
): string {
  const template = errorMessages[language][code]
  if (!template) return fallback || code
  return fill(template, withNames(params, draft))
}

/** Request field paths such as "problem.matrix.0.1" as names users recognise. */
export function fieldLabel(path: string, draft?: DraftProblem | null): string {
  const parts = path.replace(/^problem\./, '').split('.')
  const [field, a, b] = parts
  const i = Number(a)
  if (!draft || !Number.isInteger(i)) return path
  if (field === 'matrix' && parts.length >= 3) {
    return `${draft.alternatives[i] || `#${i + 1}`} / ${draft.criteria[Number(b)]?.name || `#${Number(b) + 1}`}`
  }
  if (field === 'criteria') return draft.criteria[i]?.name || `#${i + 1}`
  if (field === 'alternatives') return draft.alternatives[i] || `#${i + 1}`
  return path
}

export function locationText(language: Language, location: Location, draft?: DraftProblem | null): string {
  const t = (key: Parameters<typeof translate>[1], vars: Record<string, string | number>) =>
    translate(language, key, vars)
  switch (location.kind) {
    case 'cell':
      return t('loc.cell', { ref: location.ref ?? '' })
    case 'row':
      return t('loc.row', { index: location.index ?? '' })
    case 'value':
      return `${location.alternative} / ${location.criterion}`
    case 'field':
      return fieldLabel(location.ref ?? '', draft)
    case 'alternative':
      return location.name ?? t('loc.alternativeIndex', { index: location.index ?? '' })
    case 'criterion':
      return location.name ?? t('loc.criterionIndex', { index: location.index ?? '' })
  }
}

export function describeIssue(language: Language, issue: Issue, draft?: DraftProblem | null) {
  return {
    location: issue.location ? locationText(language, issue.location, draft) : null,
    text: errorText(language, issue.code, issue.params, issue.message, draft),
  }
}
