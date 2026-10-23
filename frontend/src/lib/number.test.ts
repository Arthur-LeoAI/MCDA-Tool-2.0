import { describe, expect, it } from 'vitest'
import { formatNumber, parseNumber } from './number'

describe('parseNumber', () => {
  it.each([
    ['12.5', 12.5],
    ['12,5', 12.5],
    [' -3 ', -3],
    ['1e3', 1000],
    ['', null],
    ['   ', null],
    ['abc', 'invalid'],
    ['1,2,3', 'invalid'],
    ['Infinity', 'invalid'],
  ])('%j -> %j', (text, expected) => {
    expect(parseNumber(text)).toBe(expected)
  })
})

describe('formatNumber', () => {
  it('hides float noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(null)).toBe('')
  })
})
