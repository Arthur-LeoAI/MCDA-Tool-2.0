import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, postJson } from './client'

afterEach(() => vi.unstubAllGlobals())

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => { throw new Error('expected the request to fail') },
    (error) => error as ApiError,
  )

const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))

describe('postJson', () => {
  it('returns parsed JSON on success', async () => {
    stubFetch(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    await expect(postJson('/api/x', {})).resolves.toEqual({ ok: 1 })
  })

  it('turns API errors into ApiError with issues', async () => {
    const body = { detail: 'Invalid decision problem', issues: [{ location: 'C4', message: 'value must be a number' }] }
    stubFetch(async () => new Response(JSON.stringify(body), { status: 422 }))
    const error = await failure(postJson('/api/x', {}))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.message).toBe('Invalid decision problem')
    expect(error.issues).toEqual(body.issues)
  })

  it('handles non-JSON error bodies', async () => {
    stubFetch(async () => new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }))
    const error = await failure(postJson('/api/x', {}))
    expect(error.status).toBe(502)
    expect(error.issues).toEqual([])
  })

  it('reports network failures as status 0', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = await failure(postJson('/api/x', {}))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })
})
