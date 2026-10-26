import { describe, expect, it } from 'vitest'
import type { LevelWeighting, Project } from '../api/types'
import {
  GROUPS,
  ROOT,
  addGroup,
  comparison,
  equalDirect,
  fromScale,
  levelOf,
  moveItem,
  normalizedDirect,
  rankRows,
  removeGroup,
  setComparison,
  setCriterionGroup,
  setMethod,
  setTied,
  structure,
  toScale,
} from './weighting'

const project = (): Project =>
  ({
    format: 'mcda-project',
    version: 2,
    alternatives: [],
    groups: [],
    criteria: ['c1', 'c2', 'c3'].map((id) => ({ id, name: id.toUpperCase(), type: 'numeric' })),
    data: {},
    constraints: [],
    weighting: { within: { _root: { method: 'direct', weights: { c1: 3, c2: 1, c3: 1 } } } },
  }) as unknown as Project

const level = (patch: Partial<LevelWeighting> = {}): LevelWeighting => ({
  method: 'direct',
  weights: {},
  order: [],
  formula: 'roc',
  comparisons: {},
  ...patch,
})

describe('structure', () => {
  it('has one root level without groups', () => {
    expect(structure(project())).toEqual({ upper: null, lower: { _root: ['c1', 'c2', 'c3'] } })
  })

  it('lists groups and ungrouped criteria, skipping empty groups', () => {
    let p = addGroup(addGroup(project(), 'g1', 'G1'), 'g2', 'G2')
    p = setCriterionGroup(p, 'c1', 'g1')
    expect(structure(p)).toEqual({ upper: ['g1', ROOT], lower: { g1: ['c1'], _root: ['c2', 'c3'] } })
  })
})

describe('levels', () => {
  it('weighs a level without settings equally', () => {
    const p = addGroup(project(), 'g1', 'G1')
    expect(levelOf(p, GROUPS, ['g1', ROOT]).weights).toEqual({ g1: 1, _root: 1 })
  })

  it('starts a ranking from the direct weights and keeps them', () => {
    const items = ['c1', 'c2', 'c3']
    const ranked = setMethod(levelOf(project(), ROOT, items), items, 'rank')
    expect(ranked.order).toEqual([['c1'], ['c2', 'c3']])
    expect(ranked.weights).toEqual({ c1: 3, c2: 1, c3: 1 })
    const ahp = setMethod(ranked, items, 'ahp')
    expect(ahp.comparisons).toEqual({ 'c1|c2': 1, 'c1|c3': 1, 'c2|c3': 1 })
    expect(setMethod(ahp, items, 'rank').order).toEqual(ranked.order)
  })

  it('sets equal and normalized direct weights', () => {
    const l = level({ weights: { a: 3, b: 1 } })
    expect(equalDirect(l, ['a', 'b']).weights).toEqual({ a: 0.5, b: 0.5 })
    expect(normalizedDirect(l, ['a', 'b']).weights).toEqual({ a: 0.75, b: 0.25 })
  })
})

describe('ranking', () => {
  const items = ['a', 'b', 'c']

  it('puts unranked items last, tied', () => {
    expect(rankRows(items, [['b'], ['x']])).toEqual([
      { id: 'b', rank: 1, tiedWithPrevious: false },
      { id: 'a', rank: 2, tiedWithPrevious: false },
      { id: 'c', rank: 2, tiedWithPrevious: true },
    ])
  })

  it('moves items and ties them', () => {
    expect(moveItem(items, [['a'], ['b'], ['c']], 'c', -1)).toEqual([['a'], ['c'], ['b']])
    expect(moveItem(items, [['a'], ['b'], ['c']], 'a', -1)).toEqual([['a'], ['b'], ['c']])
    expect(setTied(items, [['a'], ['b'], ['c']], 'b', true)).toEqual([['a', 'b'], ['c']])
  })
})

describe('pairwise comparison', () => {
  it('reads both directions and stores one key', () => {
    const l = setComparison(level({ comparisons: { 'b|a': 4 } }), 'a', 'b', 3)
    expect(l.comparisons).toEqual({ 'a|b': 3 })
    expect(comparison(l, 'b', 'a')).toBeCloseTo(1 / 3)
    expect(comparison(l, 'a', 'c')).toBeNull()
  })

  it('maps the scale to slider positions', () => {
    expect([toScale(1), toScale(5), toScale(1 / 9), toScale(null)]).toEqual([0, 4, -8, 0])
    expect([fromScale(0), fromScale(8), fromScale(-2)]).toEqual([1, 9, 1 / 3])
  })
})

describe('groups', () => {
  it('moves criteria with their weights and removes groups', () => {
    let p = addGroup(project(), 'g1', 'G1')
    p = setCriterionGroup(p, 'c1', 'g1')
    expect(p.weighting.within._root.weights).toEqual({ c2: 1, c3: 1 })
    p = setCriterionGroup(p, 'c1', null)
    expect(p.weighting.within._root.weights).toEqual({ c2: 1, c3: 1, c1: 1 })
    p = setCriterionGroup(p, 'c2', 'g1')
    p = removeGroup(p, 'g1')
    expect(p.groups).toEqual([])
    expect(p.criteria.map((c) => c.group_id ?? null)).toEqual([null, null, null])
  })
})
