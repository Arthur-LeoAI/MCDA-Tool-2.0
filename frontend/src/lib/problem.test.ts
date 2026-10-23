import { describe, expect, it } from 'vitest'
import type { DraftProblem } from '../api/types'
import {
  addAlternative,
  addCriterion,
  checkDraft,
  equalWeights,
  normalizedWeights,
  removeAlternative,
  removeCriterion,
  setCell,
  setWeights,
} from './problem'

const draft = (): DraftProblem => ({
  alternatives: ['A', 'B'],
  criteria: [
    { name: 'cost', direction: 'cost', weight: 3 },
    { name: 'quality', direction: 'benefit', weight: 1 },
  ],
  matrix: [
    [1, 2],
    [3, 4],
  ],
})

describe('editing', () => {
  it('adds rows and columns with unique names and empty cells', () => {
    const d = addCriterion(addAlternative(addAlternative(draft(), 'New'), 'New'), 'quality')
    expect(d.alternatives).toEqual(['A', 'B', 'New', 'New 2'])
    expect(d.criteria.map((c) => c.name)).toEqual(['cost', 'quality', 'quality 2'])
    expect(d.matrix).toEqual([
      [1, 2, null],
      [3, 4, null],
      [null, null, null],
      [null, null, null],
    ])
  })

  it('removes rows and columns', () => {
    const d = removeCriterion(removeAlternative(draft(), 0), 0)
    expect(d).toEqual({ alternatives: ['B'], criteria: [draft().criteria[1]], matrix: [[4]] })
  })

  it('never mutates the input', () => {
    const original = draft()
    setCell(original, 0, 0, 9)
    setWeights(original, [1, 1])
    expect(original).toEqual(draft())
  })

  it('computes weight helpers', () => {
    expect(normalizedWeights(draft().criteria)).toEqual([0.75, 0.25])
    expect(equalWeights(draft().criteria)).toEqual([0.5, 0.5])
  })
})

describe('checkDraft', () => {
  it('returns a problem when complete', () => {
    const { problem, issues } = checkDraft({ ...draft(), alternatives: [' A ', 'B'] })
    expect(issues).toEqual([])
    expect(problem?.alternatives).toEqual(['A', 'B'])
  })

  it('reports empty cells and names with readable locations', () => {
    const d = setCell({ ...draft(), alternatives: ['A', ' '] }, 0, 1, null)
    const { problem, issues } = checkDraft(d)
    expect(problem).toBeNull()
    expect(issues.map((i) => [i.code, i.location])).toEqual([
      ['empty_name', { kind: 'alternative', index: 2 }],
      ['missing_value', { kind: 'value', alternative: 'A', criterion: 'quality' }],
    ])
  })
})
