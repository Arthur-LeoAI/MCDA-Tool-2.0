// Pure, immutable editing operations on a project (the v2 model; see backend mcda_core.project).
import type { Criterion, Direction, Issue, Project, RawValue } from '../api/types'

export const ROOT = '_root'

/** A fresh id like "a7" that is not in use yet. */
export function newId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = used.size + 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`
}

export const raw = (project: Project, criterionId: string, alternativeId: string): RawValue =>
  project.data[criterionId]?.[alternativeId] ?? null

export function setValue(project: Project, criterionId: string, alternativeId: string, value: RawValue): Project {
  const column = { ...(project.data[criterionId] ?? {}), [alternativeId]: value }
  return { ...project, data: { ...project.data, [criterionId]: column } }
}

// --- Alternatives ---------------------------------------------------------------------

export function addAlternative(project: Project, baseName: string): Project {
  const id = newId(
    'a',
    project.alternatives.map((a) => a.id),
  )
  const name = uniqueName(
    baseName,
    project.alternatives.map((a) => a.name),
  )
  return { ...project, alternatives: [...project.alternatives, { id, name }] }
}

export function removeAlternative(project: Project, id: string): Project {
  const data = Object.fromEntries(
    Object.entries(project.data).map(([criterionId, column]) => {
      const rest = { ...column }
      delete rest[id]
      return [criterionId, rest]
    }),
  )
  return { ...project, alternatives: project.alternatives.filter((a) => a.id !== id), data }
}

export function renameAlternative(project: Project, id: string, name: string): Project {
  return { ...project, alternatives: project.alternatives.map((a) => (a.id === id ? { ...a, name } : a)) }
}

// --- Criteria -------------------------------------------------------------------------

export function addCriterion(project: Project, baseName: string): Project {
  const id = newId(
    'c',
    project.criteria.map((c) => c.id),
  )
  const name = uniqueName(
    baseName,
    project.criteria.map((c) => c.name),
  )
  const criterion: Criterion = {
    id,
    name,
    type: 'numeric',
    value_function: { kind: 'linear', direction: 'benefit', bounds: 'data' },
    missing: 'worst',
  }
  return setWeights({ ...project, criteria: [...project.criteria, criterion] }, { ...weightsOf(project), [id]: 1 })
}

export function removeCriterion(project: Project, id: string): Project {
  const data = { ...project.data }
  delete data[id]
  const weights = { ...weightsOf(project) }
  delete weights[id]
  return setWeights({ ...project, criteria: project.criteria.filter((c) => c.id !== id), data }, weights)
}

export function updateCriterion(project: Project, id: string, patch: Partial<Criterion>): Project {
  return { ...project, criteria: project.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
}

/** Direction where the criterion has one: numeric linear/log, or yes/no. Null otherwise. */
export function directionOf(criterion: Criterion): Direction | null {
  const vf = criterion.value_function
  if (criterion.type === 'numeric' && vf && (vf.kind === 'linear' || vf.kind === 'log')) return vf.direction
  if (criterion.type === 'boolean') return criterion.direction ?? null
  return null
}

export function setDirection(project: Project, id: string, direction: Direction): Project {
  return {
    ...project,
    criteria: project.criteria.map((c) => {
      if (c.id !== id) return c
      const vf = c.value_function
      if (c.type === 'numeric' && vf && (vf.kind === 'linear' || vf.kind === 'log')) {
        return { ...c, value_function: { ...vf, direction } }
      }
      return c.type === 'boolean' ? { ...c, direction } : c
    }),
  }
}

// --- Weights (S1: direct weights on the root level) ------------------------------------

export function weightsOf(project: Project): Record<string, number> {
  return project.weighting.within[ROOT]?.weights ?? {}
}

export function setWeights(project: Project, weights: Record<string, number>): Project {
  const level = project.weighting.within[ROOT] ?? { method: 'direct', weights: {} }
  return {
    ...project,
    weighting: {
      ...project.weighting,
      within: { ...project.weighting.within, [ROOT]: { ...level, method: 'direct', weights } },
    },
  }
}

export const setWeight = (project: Project, id: string, weight: number) =>
  setWeights(project, { ...weightsOf(project), [id]: weight })

export function totalWeight(project: Project): number {
  const weights = weightsOf(project)
  return project.criteria.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0)
}

/** Weights rescaled to sum to 1 (unchanged if they are all zero). */
export function normalizedWeights(project: Project): Record<string, number> {
  const weights = weightsOf(project)
  const total = totalWeight(project)
  return Object.fromEntries(project.criteria.map((c) => [c.id, total > 0 ? (weights[c.id] ?? 0) / total : 0]))
}

export const equalWeights = (project: Project): Record<string, number> =>
  Object.fromEntries(project.criteria.map((c) => [c.id, 1 / project.criteria.length]))

// --- Local checks -----------------------------------------------------------------------

const issue = (code: string, location: Issue['location']): Issue => ({ code, params: {}, location, message: code })

/**
 * Checks the browser can do itself before asking the server: empty names.
 * Missing values are allowed; they are handled by each criterion's policy.
 */
export function localIssues(project: Project): Issue[] {
  const issues: Issue[] = []
  project.alternatives.forEach((a, i) => {
    if (!a.name.trim()) issues.push(issue('empty_name', { kind: 'alternative', index: i + 1 }))
  })
  project.criteria.forEach((c, j) => {
    if (!c.name.trim()) issues.push(issue('empty_name', { kind: 'criterion', index: j + 1 }))
  })
  return issues
}

export function missingCount(project: Project): number {
  let count = 0
  for (const c of project.criteria) for (const a of project.alternatives) if (raw(project, c.id, a.id) === null) count++
  return count
}

/** The project as sent to the API: names trimmed. */
export function forApi(project: Project): Project {
  return {
    ...project,
    alternatives: project.alternatives.map((a) => ({ ...a, name: a.name.trim() })),
    criteria: project.criteria.map((c) => ({ ...c, name: c.name.trim() })),
  }
}
