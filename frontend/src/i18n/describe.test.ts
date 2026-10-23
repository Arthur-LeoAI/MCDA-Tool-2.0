import { describe, expect, it } from 'vitest'
import type { DraftProblem, Issue } from '../api/types'
import { describeIssue, errorText, fieldLabel, locationText } from './describe'

const draft: DraftProblem = {
  alternatives: ['Option A', 'Option B'],
  criteria: [
    { name: 'Cost', direction: 'cost', weight: 1 },
    { name: 'Quality', direction: 'benefit', weight: 1 },
  ],
  matrix: [
    [1, 2],
    [3, 4],
  ],
}

describe('errorText', () => {
  it('translates codes and fills params', () => {
    expect(errorText('zh', 'weight_negative', { value: -1 })).toBe('权重不能为负数（当前为 -1）')
    expect(errorText('en', 'file_too_large', { max_mb: 5 })).toBe('The file is larger than 5 MB')
  })

  it('names row/column params from the draft', () => {
    const params = { count: 1, row: 2, column: 1, value: 150, low: 0, high: 100 }
    expect(errorText('en', 'out_of_fixed_range', params, undefined, draft)).toContain('"Option B / Cost" = 150')
  })

  it('falls back to the server message for unknown codes', () => {
    expect(errorText('zh', 'brand_new_code', {}, 'English fallback')).toBe('English fallback')
  })
})

describe('locations', () => {
  it('formats each kind', () => {
    expect(locationText('zh', { kind: 'cell', ref: 'C4' })).toBe('单元格 C4')
    expect(locationText('en', { kind: 'row', index: 2 })).toBe('row 2')
    expect(locationText('zh', { kind: 'alternative', index: 3 })).toBe('第 3 个方案')
    expect(locationText('en', { kind: 'criterion', name: 'Cost' })).toBe('Cost')
    expect(locationText('en', { kind: 'value', alternative: 'A', criterion: 'Cost' })).toBe('A / Cost')
    expect(locationText('en', { kind: 'field', ref: 'problem.matrix.1.0' }, draft)).toBe('Option B / Cost')
  })

  it('maps request field paths to names', () => {
    expect(fieldLabel('problem.criteria.1.weight', draft)).toBe('Quality')
    expect(fieldLabel('alternatives.0', draft)).toBe('Option A')
    expect(fieldLabel('methods.0.p', draft)).toBe('methods.0.p')
    expect(fieldLabel('matrix.0.1')).toBe('matrix.0.1')
  })

  it('describes a full issue', () => {
    const issue: Issue = {
      code: 'duplicate_name',
      params: {},
      location: { kind: 'alternative', name: 'Option A' },
      message: 'duplicate name',
    }
    expect(describeIssue('zh', issue)).toEqual({ location: 'Option A', text: '名称重复' })
  })
})
