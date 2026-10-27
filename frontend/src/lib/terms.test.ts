import { describe, expect, it } from 'vitest'
import type { TemplateInfo } from '../api/types'
import { alternativeTerm } from './terms'

const amazon = { id: 'amazon', terms: { alternative: { zh: '产品', en: 'Product' } } } as unknown as TemplateInfo

describe('alternativeTerm', () => {
  it("uses the template's word, lower case in English", () => {
    expect(alternativeTerm('zh', [amazon], 'amazon')).toBe('产品')
    expect(alternativeTerm('en', [amazon], 'amazon')).toBe('product')
  })

  it('falls back to the general word', () => {
    expect(alternativeTerm('zh', [amazon], null)).toBe('方案')
    expect(alternativeTerm('en', [], 'amazon')).toBe('alternative')
  })
})
