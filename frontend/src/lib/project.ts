// Pure, immutable editing operations on a project (the v2 model; see backend mcda_core.project).
import type { Constraint, Criterion, Direction, Issue, NewConstraint, Project, RawValue } from '../api/types'
import { ROOT, dropItem, setLevel, withItem } from './weighting'

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
  const added = { ...project, criteria: [...project.criteria, criterion] }
  const root = project.weighting.within[ROOT]
  return root ? setLevel(added, ROOT, withItem(root, id)) : added
}

export function removeCriterion(project: Project, id: string): Project {
  const data = { ...project.data }
  delete data[id]
  const key = project.criteria.find((c) => c.id === id)?.group_id ?? ROOT
  const removed = { ...project, criteria: project.criteria.filter((c) => c.id !== id), data }
  const level = project.weighting.within[key]
  return level ? setLevel(removed, key, dropItem(level, id)) : removed
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

// --- Scoring and conditions (S3) ----------------------------------------------------------

/** Numeric raw values of one criterion (for default parameters in editors). */
export function numericRange(project: Project, criterionId: string): [number, number] | null {
  const values = project.alternatives
    .map((a) => raw(project, criterionId, a.id))
    .filter((v): v is number => typeof v === 'number')
  return values.length ? [Math.min(...values), Math.max(...values)] : null
}

export const constraintsFor = (project: Project, criterionId: string) =>
  project.constraints.filter((c) => c.criterion_id === criterionId)

export function addConstraint(project: Project, constraint: NewConstraint): Project {
  const id = newId(
    'k',
    project.constraints.map((c) => c.id),
  )
  return { ...project, constraints: [...project.constraints, { ...constraint, id } as Constraint] }
}

export const removeConstraint = (project: Project, id: string): Project => ({
  ...project,
  constraints: project.constraints.filter((c) => c.id !== id),
})

export const updateConstraint = (project: Project, id: string, patch: Partial<Constraint>): Project => ({
  ...project,
  constraints: project.constraints.map((c) => (c.id === id ? ({ ...c, ...patch } as Constraint) : c)),
})
