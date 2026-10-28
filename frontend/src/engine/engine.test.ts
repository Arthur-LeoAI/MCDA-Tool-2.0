// @vitest-environment node
// Standard Request/FormData/Blob (Node's), as in a browser; jsdom's FormData does not mix with Node's Request.
import { describe, expect, it } from 'vitest'
import { ENGINE, engineFetch, toMessage, toResponse } from '.'

describe('browser engine bridge', () => {
  it('turns a JSON request into a worker message', async () => {
    const message = await toMessage(3, '/projects/evaluate?x=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    })
    expect(message.id).toBe(3)
    expect(message.method).toBe('POST')
    expect(message.path).toBe('/projects/evaluate?x=1')
    expect(message.headers).toContainEqual(['content-type', 'application/json'])
    expect(new TextDecoder().decode(message.body)).toBe('{"a":1}')
  })

  it('encodes uploads as multipart, as fetch would', async () => {
    const form = new FormData()
    form.append('file', new Blob(['a,b\n1,2\n']), 'table.csv')
    const message = await toMessage(1, '/tables/inspect', { method: 'POST', body: form })
    const contentType = message.headers.find(([name]) => name === 'content-type')?.[1] ?? ''
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
    const body = new TextDecoder().decode(message.body)
    expect(body).toContain('filename="table.csv"')
    expect(body).toContain('a,b\n1,2\n')
  })

  it('turns a worker reply into a Response', async () => {
    const body = new TextEncoder().encode('{"ok":true}').buffer
    const response = toResponse(422, [['content-type', 'application/json']], body)
    expect(response.status).toBe(422)
    expect(response.ok).toBe(false)
    expect(await response.json()).toEqual({ ok: true })
    expect(toResponse(204, [], new ArrayBuffer(0)).status).toBe(204)
  })

  it('uses the server unless the build selects the browser engine', () => {
    expect(ENGINE).toBe('server')
    expect(typeof engineFetch).toBe('function')
  })
})
