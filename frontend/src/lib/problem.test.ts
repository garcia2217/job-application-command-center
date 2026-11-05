import { describe, expect, test } from 'bun:test'
import { parseProblem, toFieldErrors } from '@/lib/problem'

describe('parseProblem', () => {
  test('parses the shared contract fixture', async () => {
    const body = await Bun.file(
      new URL('../../../docs/api-fixtures/validation-error.json', import.meta.url),
    ).json()
    expect(parseProblem(422, body)).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: '1 field(s) failed validation',
      fieldErrors: { role_title: ['Field required'] },
      existingId: undefined,
    })
  })

  test('no errors member leaves fieldErrors undefined', () => {
    const p = parseProblem(404, { code: 'NOT_FOUND', detail: 'Not found' })
    expect(p.fieldErrors).toBeUndefined()
    expect(p.code).toBe('NOT_FOUND')
  })

  test('empty errors array leaves fieldErrors undefined', () => {
    expect(parseProblem(422, { code: 'VALIDATION_FAILED', detail: 'x', errors: [] }).fieldErrors).toBeUndefined()
  })

  test.each([[null], ['oops'], [42], [[1, 2]]])('non-object body %p falls back to HTTP_ERROR', (body) => {
    expect(parseProblem(502, body)).toEqual({ status: 502, code: 'HTTP_ERROR', detail: 'Request failed' })
  })

  test('missing code and detail fall back', () => {
    const p = parseProblem(500, {})
    expect(p.code).toBe('HTTP_ERROR')
    expect(p.detail).toBe('Request failed')
    expect(p.status).toBe(500)
  })

  test('integer existing_id is surfaced', () => {
    const p = parseProblem(409, { code: 'COMPANY_NAME_TAKEN', detail: 'taken', existing_id: 7 })
    expect(p.existingId).toBe(7)
  })

  test.each([['7'], [7.5], [null]])('non-integer existing_id %p is ignored', (existing) => {
    const p = parseProblem(409, { code: 'COMPANY_NAME_TAKEN', detail: 'taken', existing_id: existing })
    expect(p.existingId).toBeUndefined()
  })
})

describe('toFieldErrors', () => {
  test('keeps two messages on one field in order', () => {
    expect(
      toFieldErrors([
        { location: 'body', field: 'salary_max', message: 'first', type: 'a' },
        { location: 'body', field: 'salary_max', message: 'second', type: 'b' },
      ]),
    ).toEqual({ salary_max: ['first', 'second'] })
  })

  test('null field groups under _', () => {
    expect(toFieldErrors([{ location: 'body', field: null, message: 'whole body', type: 'x' }])).toEqual({
      _: ['whole body'],
    })
  })

  test('skips malformed entries without throwing', () => {
    expect(
      toFieldErrors([
        { location: 'body', field: 'name' },
        null,
        'nope',
        { location: 'body', field: 'email', message: 'Bad email', type: 'x' },
      ]),
    ).toEqual({ email: ['Bad email'] })
  })

  test('only malformed entries → undefined', () => {
    expect(toFieldErrors([{ field: 'name' }])).toBeUndefined()
  })

  test('non-array → undefined', () => {
    expect(toFieldErrors({ field: 'x', message: 'y' })).toBeUndefined()
    expect(toFieldErrors(undefined)).toBeUndefined()
  })
})
