import { describe, expect, it } from 'vitest'
import type { Project } from '../api/types'
import {
  addAlternative,
  addCriterion,
  directionOf,
  equalWeights,
  forApi,
  localIssues,
  missingCount,
  newId,
  normalizedWeights,
  raw,
  removeAlternative,
  removeCriterion,
  setDirection,
  setValue,
  setWeight,
  weightsOf,
} from './project'
import { projectFilename } from './projectFile'

const project = (): Project =>
  ({
    format: 'mcda-project',
    version: 2,
    meta: { name: '', description: '', language: 'zh' },
    alternatives: [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ],
    groups: [],
    criteria: [
      {
        id: 'c1',
        name: 'cost',
        type: 'numeric',
        value_function: { kind: 'linear', direction: 'cost', bounds: 'data' },
        missing: 'worst',
      },
      { id: 'c2', name: 'eco', type: 'boolean', direction: 'benefit', missing: 'worst' },
    ],
    data: { c1: { a1: 10, a2: null }, c2: { a1: true, a2: false } },
    constraints: [],
    weighting: { within: { _root: { method: 'direct', weights: { c1: 3, c2: 1 } } } },
    analysis: { methods: [{ method: 'weighted_sum' }] },
  }) as unknown as Project

describe('ids and names', () => {
  it('creates unused ids', () => {
    expect(newId('a', ['a1', 'a2'])).toBe('a3')
    expect(newId('a', ['a1', 'a3'])).toBe('a4')
    expect(newId('c', [])).toBe('c1')
  })

  it('adds alternatives and criteria with unique names', () => {
    const p = addCriterion(addAlternative(addAlternative(project(), 'A'), 'A'), 'cost')
    expect(p.alternatives.map((a) => [a.id, a.name])).toEqual([
      ['a1', 'A'],
      ['a2', 'B'],
      ['a3', 'A 2'],
      ['a4', 'A 3'],
    ])
    const added = p.criteria[2]
    expect([added.id, added.name, added.value_function?.kind]).toEqual(['c3', 'cost 2', 'linear'])
    expect(weightsOf(p).c3).toBe(1)
  })
})

describe('editing', () => {
  it('removes alternatives together with their data', () => {
    const p = removeAlternative(project(), 'a1')
    expect(p.alternatives.map((a) => a.id)).toEqual(['a2'])
    expect(p.data).toEqual({ c1: { a2: null }, c2: { a2: false } })
  })

  it('removes criteria together with data and weight', () => {
    const p = removeCriterion(project(), 'c1')
    expect(p.criteria.map((c) => c.id)).toEqual(['c2'])
    expect(p.data.c1).toBeUndefined()
    expect(weightsOf(p)).toEqual({ c2: 1 })
  })

  it('sets values and directions without mutating the input', () => {
    const original = project()
    const p = setDirection(setValue(original, 'c1', 'a2', 7), 'c1', 'benefit')
    expect(raw(p, 'c1', 'a2')).toBe(7)
    expect(directionOf(p.criteria[0])).toBe('benefit')
    expect(directionOf(setDirection(p, 'c2', 'cost').criteria[1])).toBe('cost')
    expect(original).toEqual(project())
  })
})

describe('weights', () => {
  it('reads, sets and normalizes direct weights', () => {
    expect(normalizedWeights(project())).toEqual({ c1: 0.75, c2: 0.25 })
    expect(equalWeights(project())).toEqual({ c1: 0.5, c2: 0.5 })
    expect(weightsOf(setWeight(project(), 'c2', 3))).toEqual({ c1: 3, c2: 3 })
  })
})

describe('checks', () => {
  it('reports empty names and counts missing values', () => {
    const p = { ...project(), alternatives: [{ id: 'a1', name: ' ' }, project().alternatives[1]] }
    expect(localIssues(p).map((i) => [i.code, i.location])).toEqual([['empty_name', { kind: 'alternative', index: 1 }]])
    expect(missingCount(project())).toBe(1)
  })

  it('trims names for the API', () => {
    const p = { ...project(), alternatives: [{ id: 'a1', name: ' A ' }, project().alternatives[1]] }
    expect(forApi(p).alternatives[0].name).toBe('A')
  })
})

describe('project files', () => {
  it('derives a safe file name', () => {
    expect(projectFilename(project())).toBe('mcda-project.mcda.json')
    const named = { ...project(), meta: { ...project().meta, name: 'Q4: picks/2026' } }
    expect(projectFilename(named)).toBe('Q4- picks-2026.mcda.json')
  })
})
