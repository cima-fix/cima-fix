import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/server/app.ts'
import { AppError } from '../../src/server/middleware/errors.ts'

const app = createApp({
  extend: (api) => {
    api.get('/_t/ok', (c) => c.json({ ok: true }))
    api.post('/_t/ok', (c) => c.json({ ok: true }))
    api.get('/_t/app-error', () => {
      throw new AppError(409, 'NAME_TAKEN', 'Ese nombre ya existe.', 'name')
    })
    api.get('/_t/crash', () => {
      throw new Error('secret detail')
    })
    api.get('/_t/items/:id', (c) => c.json({ id: c.req.param('id') }))
  },
})

const json = { 'content-type': 'application/json' }

describe('api middleware', () => {
  it('rejects a non-JSON POST with 415', async () => {
    const res = await app.request('/api/_t/ok', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hi',
    })
    expect(res.status).toBe(415)
    expect(await res.json()).toMatchObject({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE' },
    })
  })

  it('rejects a POST with no content type with 415', async () => {
    const res = await app.request('/api/_t/ok', { method: 'POST' })
    expect(res.status).toBe(415)
  })

  it('accepts JSON with a charset parameter', async () => {
    const res = await app.request('/api/_t/ok', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{}',
    })
    expect(res.status).toBe(200)
  })

  it('serializes AppError in the standard format', async () => {
    const res = await app.request('/api/_t/app-error')
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: {
        code: 'NAME_TAKEN',
        message: 'Ese nombre ya existe.',
        field: 'name',
      },
    })
  })

  it('hides unexpected errors behind a generic 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await app.request('/api/_t/crash')
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('INTERNAL_ERROR')
    expect(text).not.toContain('secret detail')
  })

  it('answers 405 with Allow when the path exists for another method', async () => {
    const res = await app.request('/api/_t/items/42', {
      method: 'POST',
      headers: json,
      body: '{}',
    })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
  })

  it('answers 404 in the standard format for unknown paths', async () => {
    const res = await app.request('/api/_t/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('sends security headers', async () => {
    const res = await app.request('/api/_t/ok')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
