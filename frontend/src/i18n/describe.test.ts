import { describe, expect, it } from 'vitest'
import type { Issue, Project } from '../api/types'
import { describeIssue, errorText, fieldLabel, locationText } from './describe'

const project = {
  format: 'mcda-project',
  version: 2,
  alternatives: [
    { id: 'a1', name: 'Option A' },
    { id: 'a2', name: 'Option B' },
  ],
  criteria: [
    { id: 'c1', name: 'Cost', type: 'numeric', value_function: { kind: 'linear', direction: 'cost', bounds: 'data' } },
    {
      id: 'c2',
      name: 'Quality',
      type: 'numeric',
      value_function: { kind: 'linear', direction: 'benefit', bounds: 'data' },
    },
  ],
  data: {},
} as unknown as Project

describe('errorText', () => {
  it('translates codes and fills params', () => {
    expect(errorText('zh', 'weight_negative', { value: -1 })).toBe('权重不能为负数（当前为 -1）')
    expect(errorText('en', 'file_too_large', { max_mb: 5 })).toBe('The file is larger than 5 MB')
  })

  it('names row/column params from the project', () => {
    const params = { count: 1, row: 2, column: 1, value: 150, low: 0, high: 100 }
    expect(errorText('en', 'out_of_fixed_range', params, undefined, project)).toContain('"Option B / Cost" = 150')
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
    expect(locationText('zh', { kind: 'group', index: 1 })).toBe('第 1 个分组')
    expect(locationText('en', { kind: 'constraint', ref: 'k1' })).toBe('condition k1')
    expect(locationText('en', { kind: 'value', alternative: 'A', criterion: 'Cost' })).toBe('A / Cost')
    expect(locationText('en', { kind: 'field', ref: 'project.data.c1.a2' }, project)).toBe('Option B / Cost')
  })

  it('maps request field paths to names', () => {
    expect(fieldLabel('criteria.1.name', project)).toBe('Quality')
    expect(fieldLabel('alternatives.0', project)).toBe('Option A')
    expect(fieldLabel('data.c2', project)).toBe('Quality')
    expect(fieldLabel('analysis.methods.0.p', project)).toBe('analysis.methods.0.p')
    expect(fieldLabel('data.c1.a1')).toBe('data.c1.a1')
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
