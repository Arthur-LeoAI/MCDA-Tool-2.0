// Groups and the three weighting methods (S4); mirrors backend mcda_core.project.weighting.
import type { LevelWeighting, Project, WeightingMethod } from '../api/types'

export const ROOT = '_root'
/** Key of the upper level (weights between groups). */
export const GROUPS = 'groups'

/** The values of Saaty's 1–9 scale offered in the editor. */
export const AHP_MAX = 9

// --- Structure ------------------------------------------------------------------------------

export interface Structure {
  /** Upper-level items (group ids, plus ROOT for ungrouped criteria); null without groups. */
  upper: string[] | null
  /** Criterion ids of each lower level, keyed by group id or ROOT. */
  lower: Record<string, string[]>
}

export function structure(project: Project): Structure {
  if (!project.groups?.length) return { upper: null, lower: { [ROOT]: project.criteria.map((c) => c.id) } }
  const lower: Record<string, string[]> = Object.fromEntries(project.groups.map((g) => [g.id, []]))
  lower[ROOT] = []
  for (const c of project.criteria) lower[c.group_id && c.group_id in lower ? c.group_id : ROOT].push(c.id)
  const used = Object.fromEntries(Object.entries(lower).filter(([, ids]) => ids.length > 0))
  return { upper: Object.keys(used), lower: used }
}

// --- Reading and writing one level -------------------------------------------------------------

const equal = (items: string[]): LevelWeighting => ({
  method: 'direct',
  weights: Object.fromEntries(items.map((i) => [i, 1])),
  order: [],
  formula: 'roc',
  comparisons: {},
})

/** A level's settings; a level without settings weighs its items equally (as the backend does). */
export function levelOf(project: Project, key: string, items: string[]): LevelWeighting {
  const stored = key === GROUPS ? project.weighting.groups : project.weighting.within[key]
  return stored ? { ...equal(items), ...stored } : equal(items)
}

export function setLevel(project: Project, key: string, level: LevelWeighting): Project {
  const weighting =
    key === GROUPS
      ? { ...project.weighting, groups: level }
      : { ...project.weighting, within: { ...project.weighting.within, [key]: level } }
  return { ...project, weighting }
}

/** Switch method, keeping every method's inputs; rank and AHP start from the current direct weights. */
export function setMethod(level: LevelWeighting, items: string[], method: WeightingMethod): LevelWeighting {
  const next = { ...level, method }
  if (method === 'rank' && !level.order?.length) next.order = orderFromWeights(items, level.weights ?? {})
  if (method === 'ahp' && !Object.keys(level.comparisons ?? {}).length) {
    next.comparisons = Object.fromEntries(pairs(items).map(([i, j]) => [`${i}|${j}`, 1]))
  }
  return next
}

/** Most important first; equal weights are tied. */
export function orderFromWeights(items: string[], weights: Record<string, number>): string[][] {
  const sorted = [...items].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0))
  const order: string[][] = []
  for (const id of sorted) {
    const last = order.at(-1)
    if (last && (weights[last[0]] ?? 0) === (weights[id] ?? 0)) last.push(id)
    else order.push([id])
  }
  return order
}

/**
 * Add an item to a level that has settings: direct weights get the mean of the others
 * (or 1), so the item does not silently weigh 0. Rankings put it last; AHP asks for comparisons.
 */
export function withItem(level: LevelWeighting, id: string): LevelWeighting {
  const weights = level.weights ?? {}
  if (id in weights) return level
  const others = Object.values(weights).filter((w) => w > 0)
  return { ...level, weights: { ...weights, [id]: others.length ? others.reduce((a, b) => a + b) / others.length : 1 } }
}

/** Remove an item from every input of a level (when a criterion moves to another group). */
export function dropItem(level: LevelWeighting, id: string): LevelWeighting {
  const weights = { ...(level.weights ?? {}) }
  delete weights[id]
  const comparisons = Object.fromEntries(
    Object.entries(level.comparisons ?? {}).filter(([key]) => !key.split('|').includes(id)),
  )
  const order = (level.order ?? []).map((tie) => tie.filter((i) => i !== id)).filter((tie) => tie.length)
  return { ...level, weights, comparisons, order }
}

// --- Direct weights ---------------------------------------------------------------------------

export const setDirectWeight = (level: LevelWeighting, id: string, weight: number): LevelWeighting => ({
  ...level,
  weights: { ...(level.weights ?? {}), [id]: weight },
})

export const equalDirect = (level: LevelWeighting, items: string[]): LevelWeighting => ({
  ...level,
  weights: Object.fromEntries(items.map((i) => [i, 1 / items.length])),
})

/** Rescale to sum 1 (unchanged when all are zero). */
export function normalizedDirect(level: LevelWeighting, items: string[]): LevelWeighting {
  const total = items.reduce((sum, i) => sum + (level.weights?.[i] ?? 0), 0)
  if (total <= 0) return level
  return { ...level, weights: Object.fromEntries(items.map((i) => [i, (level.weights?.[i] ?? 0) / total])) }
}

// --- Ranking ----------------------------------------------------------------------------------

export interface RankRow {
  id: string
  /** 1-based position of its tie group. */
  rank: number
  tiedWithPrevious: boolean
}

/** The full ranking: unknown ids dropped, unranked items tied last (as the backend treats them). */
export function rankRows(items: string[], order: string[][]): RankRow[] {
  const known = new Set(items)
  const ties = order.map((tie) => tie.filter((i) => known.has(i))).filter((tie) => tie.length)
  const placed = new Set(ties.flat())
  const rest = items.filter((i) => !placed.has(i))
  if (rest.length) ties.push(rest)
  const rows: RankRow[] = []
  let rank = 1
  for (const tie of ties) {
    tie.forEach((id, k) => rows.push({ id, rank, tiedWithPrevious: k > 0 }))
    rank += tie.length
  }
  return rows
}

function orderFromRows(rows: { id: string; tiedWithPrevious: boolean }[]): string[][] {
  const order: string[][] = []
  rows.forEach((row, k) => (k > 0 && row.tiedWithPrevious ? order.at(-1)!.push(row.id) : order.push([row.id])))
  return order
}

/** Move an item one place up (-1) or down (+1); it keeps its tie flag. */
export function moveItem(items: string[], order: string[][], id: string, delta: -1 | 1): string[][] {
  const rows = rankRows(items, order)
  const k = rows.findIndex((r) => r.id === id)
  const target = k + delta
  if (k < 0 || target < 0 || target >= rows.length) return orderFromRows(rows)
  ;[rows[k], rows[target]] = [rows[target], rows[k]]
  return orderFromRows(rows)
}

export function setTied(items: string[], order: string[][], id: string, tied: boolean): string[][] {
  return orderFromRows(rankRows(items, order).map((r) => (r.id === id ? { ...r, tiedWithPrevious: tied } : r)))
}

// --- Pairwise comparison (AHP) ------------------------------------------------------------------

export function pairs(items: string[]): [string, string][] {
  return items.flatMap((i, k) => items.slice(k + 1).map((j) => [i, j] as [string, string]))
}

/** How much more important i is than j, or null when not compared yet. */
export function comparison(level: LevelWeighting, i: string, j: string): number | null {
  const c = level.comparisons ?? {}
  if (`${i}|${j}` in c) return c[`${i}|${j}`]
  if (`${j}|${i}` in c) return 1 / c[`${j}|${i}`]
  return null
}

/** Store i-over-j under one key only. */
export function setComparison(level: LevelWeighting, i: string, j: string, value: number): LevelWeighting {
  const comparisons = { ...(level.comparisons ?? {}), [`${i}|${j}`]: value }
  delete comparisons[`${j}|${i}`]
  return { ...level, comparisons }
}

/**
 * Slider position for a comparison: 0 = equal, +k = i is k+1 times as important, -k = j is.
 * Values between scale points are rounded to the nearest one.
 */
export function toScale(value: number | null): number {
  if (value === null) return 0
  return value >= 1 ? Math.round(value) - 1 : -(Math.round(1 / value) - 1)
}

export const fromScale = (position: number): number => (position >= 0 ? position + 1 : 1 / (1 - position))

// --- Groups -----------------------------------------------------------------------------------

export function addGroup(project: Project, id: string, name: string): Project {
  return { ...project, groups: [...(project.groups ?? []), { id, name }] }
}

export const renameGroup = (project: Project, id: string, name: string): Project => ({
  ...project,
  groups: (project.groups ?? []).map((g) => (g.id === id ? { ...g, name } : g)),
})

/** Delete a group; its criteria become ungrouped and its weights are dropped. */
export function removeGroup(project: Project, id: string): Project {
  const within = { ...project.weighting.within }
  delete within[id]
  const groups = project.weighting.groups ? dropItem(project.weighting.groups, id) : project.weighting.groups
  return {
    ...project,
    groups: (project.groups ?? []).filter((g) => g.id !== id),
    criteria: project.criteria.map((c) => (c.group_id === id ? { ...c, group_id: null } : c)),
    weighting: { ...project.weighting, groups, within },
  }
}

/** Move a criterion to a group (null: ungrouped), removing it from its old level's inputs. */
export function setCriterionGroup(project: Project, criterionId: string, groupId: string | null): Project {
  const criterion = project.criteria.find((c) => c.id === criterionId)
  if (!criterion) return project
  const from = criterion.group_id ?? ROOT
  const to = groupId ?? ROOT
  if (from === to) return project
  let moved: Project = {
    ...project,
    criteria: project.criteria.map((c) => (c.id === criterionId ? { ...c, group_id: groupId } : c)),
  }
  const old = moved.weighting.within[from]
  if (old) moved = setLevel(moved, from, dropItem(old, criterionId))
  const target = moved.weighting.within[to]
  if (target) moved = setLevel(moved, to, withItem(target, criterionId))
  return moved
}
