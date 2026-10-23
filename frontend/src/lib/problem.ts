// Pure, immutable editing operations on a draft problem.
import type { Criterion, DraftProblem, Issue, Problem } from '../api/types'

export const emptyDraft = (): DraftProblem => ({ alternatives: [], criteria: [], matrix: [] })

export function draftFromProblem(problem: Problem): DraftProblem {
  return {
    alternatives: [...problem.alternatives],
    criteria: problem.criteria.map((c) => ({ ...c })),
    matrix: problem.matrix.map((row) => [...row]),
  }
}

function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`
}

export function addAlternative(draft: DraftProblem, baseName: string): DraftProblem {
  return {
    ...draft,
    alternatives: [...draft.alternatives, uniqueName(baseName, draft.alternatives)],
    matrix: [...draft.matrix, draft.criteria.map(() => null)],
  }
}

export function removeAlternative(draft: DraftProblem, index: number): DraftProblem {
  return {
    ...draft,
    alternatives: draft.alternatives.filter((_, i) => i !== index),
    matrix: draft.matrix.filter((_, i) => i !== index),
  }
}

export function renameAlternative(draft: DraftProblem, index: number, name: string): DraftProblem {
  return { ...draft, alternatives: draft.alternatives.map((a, i) => (i === index ? name : a)) }
}

export function addCriterion(draft: DraftProblem, baseName: string): DraftProblem {
  const name = uniqueName(
    baseName,
    draft.criteria.map((c) => c.name),
  )
  return {
    ...draft,
    criteria: [...draft.criteria, { name, direction: 'benefit', weight: 1 }],
    matrix: draft.matrix.map((row) => [...row, null]),
  }
}

export function removeCriterion(draft: DraftProblem, index: number): DraftProblem {
  return {
    ...draft,
    criteria: draft.criteria.filter((_, j) => j !== index),
    matrix: draft.matrix.map((row) => row.filter((_, j) => j !== index)),
  }
}

export function updateCriterion(draft: DraftProblem, index: number, patch: Partial<Criterion>): DraftProblem {
  return { ...draft, criteria: draft.criteria.map((c, j) => (j === index ? { ...c, ...patch } : c)) }
}

export function setCell(draft: DraftProblem, i: number, j: number, value: number | null): DraftProblem {
  return {
    ...draft,
    matrix: draft.matrix.map((row, r) => (r === i ? row.map((v, c) => (c === j ? value : v)) : row)),
  }
}

export function setWeights(draft: DraftProblem, weights: number[]): DraftProblem {
  return { ...draft, criteria: draft.criteria.map((c, j) => ({ ...c, weight: weights[j] })) }
}

export const totalWeight = (criteria: Criterion[]) => criteria.reduce((sum, c) => sum + c.weight, 0)

/** Weights rescaled to sum to 1 (unchanged if they are all zero). */
export function normalizedWeights(criteria: Criterion[]): number[] {
  const total = totalWeight(criteria)
  return criteria.map((c) => (total > 0 ? c.weight / total : c.weight))
}

export const equalWeights = (criteria: Criterion[]) => criteria.map(() => 1 / criteria.length)

/**
 * Checks the browser can do itself before asking the server: empty cells
 * and names. Returns a complete Problem when there is nothing to report.
 */
const issue = (code: string, location: Issue['location']): Issue => ({ code, params: {}, location, message: code })

export function checkDraft(draft: DraftProblem): { problem: Problem | null; issues: Issue[] } {
  const issues: Issue[] = []
  draft.alternatives.forEach((name, i) => {
    if (!name.trim()) issues.push(issue('empty_name', { kind: 'alternative', index: i + 1 }))
  })
  draft.criteria.forEach((c, j) => {
    if (!c.name.trim()) issues.push(issue('empty_name', { kind: 'criterion', index: j + 1 }))
  })
  draft.matrix.forEach((row, i) =>
    row.forEach((value, j) => {
      if (value === null || !Number.isFinite(value)) {
        const alternative = draft.alternatives[i] || `#${i + 1}`
        const criterion = draft.criteria[j]?.name || `#${j + 1}`
        issues.push(issue('missing_value', { kind: 'value', alternative, criterion }))
      }
    }),
  )
  if (issues.length) return { problem: null, issues }
  return {
    problem: {
      alternatives: draft.alternatives.map((a) => a.trim()),
      criteria: draft.criteria.map((c) => ({ ...c, name: c.name.trim() })),
      matrix: draft.matrix as number[][],
    },
    issues,
  }
}
