// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { errorMessages } from './errors'

// The backend's message catalogue is the list of codes the API can return.
const source = readFileSync(new URL('../../../backend/src/mcda_core/errors.py', import.meta.url), 'utf8')
const catalogue = source.slice(source.indexOf('MESSAGES'), source.indexOf('\n}\n', source.indexOf('MESSAGES')))
const backendCodes = [...catalogue.matchAll(/^ {4}"(\w+)":/gm)].map((m) => m[1])

describe('error translations', () => {
  it('found the backend catalogue', () => {
    expect(backendCodes.length).toBeGreaterThan(30)
  })

  it.each(['zh', 'en'] as const)('cover every backend error code in %s', (language) => {
    const missing = backendCodes.filter((code) => !(code in errorMessages[language]))
    expect(missing).toEqual([])
  })

  it('have the same codes in both languages', () => {
    expect(Object.keys(errorMessages.zh).sort()).toEqual(Object.keys(errorMessages.en).sort())
  })
})
