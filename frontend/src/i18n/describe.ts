// Turn error codes and structured locations into text in the user's language.
import type { Issue, Location, Project } from '../api/types'
import { errorMessages } from './errors'
import type { Language } from './messages'
import { translate } from './useT'

const fill = (text: string, params: Record<string, unknown>) =>
  text.replace(/\{(\w+)\}/g, (_, name) => (params[name] === undefined ? `{${name}}` : String(params[name])))

/** Name the alternative/criterion behind 1-based row/column params, when the project is known. */
function withNames(params: Record<string, unknown>, project?: Project | null): Record<string, unknown> {
  const row = Number(params.row)
  const column = Number(params.column)
  return {
    ...params,
    alternative: params.alternative ?? project?.alternatives[row - 1]?.name ?? `#${params.row}`,
    criterion: params.criterion ?? project?.criteria[column - 1]?.name ?? `#${params.column}`,
  }
}

/** Text for an error code; falls back to the server's English message for unknown codes. */
export function errorText(
  language: Language,
  code: string,
  params: Record<string, unknown> = {},
  fallback?: string,
  project?: Project | null,
): string {
  const template = errorMessages[language][code]
  if (!template) return fallback || code
  return fill(template, withNames(params, project))
}

/** Request field paths such as "project.data.c1.a2" as names users recognise. */
export function fieldLabel(path: string, project?: Project | null): string {
  const parts = path.replace(/^project\./, '').split('.')
  if (!project) return path
  const alternative = (key: string) =>
    project.alternatives.find((a) => a.id === key)?.name ?? project.alternatives[Number(key)]?.name
  const criterion = (key: string) =>
    project.criteria.find((c) => c.id === key)?.name ?? project.criteria[Number(key)]?.name
  const [field, a, b] = parts
  if (field === 'data' && a !== undefined) {
    const c = criterion(a) ?? a
    return b === undefined ? c : `${alternative(b) ?? b} / ${c}`
  }
  if (field === 'alternatives' && a !== undefined) return alternative(a) ?? path
  if (field === 'criteria' && a !== undefined) return criterion(a) ?? path
  return path
}

export function locationText(language: Language, location: Location, project?: Project | null): string {
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
      return fieldLabel(location.ref ?? '', project)
    case 'constraint':
      return t('loc.constraint', { ref: location.ref ?? '' })
    case 'alternative':
      return location.name ?? t('loc.alternativeIndex', { index: location.index ?? '' })
    case 'criterion':
      return location.name ?? t('loc.criterionIndex', { index: location.index ?? '' })
    case 'group':
      return location.name ?? t('loc.groupIndex', { index: location.index ?? '' })
  }
}

export function describeIssue(language: Language, issue: Issue, project?: Project | null) {
  return {
    location: issue.location ? locationText(language, issue.location, project) : null,
    text: errorText(language, issue.code, issue.params, issue.message, project),
  }
}
