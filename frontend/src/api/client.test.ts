import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, postJson } from './client'

afterEach(() => vi.unstubAllGlobals())

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected the request to fail')
    },
    (error) => error as ApiError,
  )

const stubFetch = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))

describe('postJson', () => {
  it('returns parsed JSON on success and calls the versioned root', async () => {
    stubFetch(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    await expect(postJson('/x', {})).resolves.toEqual({ ok: 1 })
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/x')
  })

  it('turns API errors into ApiError with issues', async () => {
    const issues = [
      { code: 'value_not_number', params: { value: 'x' }, location: { kind: 'cell', ref: 'C4' }, message: '…' },
    ]
    const body = { code: 'invalid_problem', detail: 'Invalid decision problem', params: {}, issues, request_id: 'r1' }
    stubFetch(async () => new Response(JSON.stringify(body), { status: 422 }))
    const error = await failure(postJson('/x', {}))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.code).toBe('invalid_problem')
    expect(error.message).toBe('Invalid decision problem')
    expect(error.issues).toEqual(issues)
    expect(error.requestId).toBe('r1')
  })

  it('handles non-JSON error bodies', async () => {
    stubFetch(async () => new Response('Oops', { status: 500, statusText: 'Internal Server Error' }))
    const error = await failure(postJson('/x', {}))
    expect(error.status).toBe(500)
    expect(error.code).toBe('unknown')
    expect(error.issues).toEqual([])
  })

  it.each([502, 503, 504])('treats a proxy %i without our error body as an unreachable API', async (status) => {
    stubFetch(async () => new Response('Bad gateway', { status }))
    const error = await failure(postJson('/x', {}))
    expect(error.status).toBe(status)
    expect(error.code).toBe('network')
  })

  it('reports network failures as status 0', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = await failure(postJson('/x', {}))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('network')
  })
})
