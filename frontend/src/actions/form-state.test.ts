import { describe, expect, mock, test } from 'bun:test'

// api.ts is server-only (it imports next/headers); stand in a same-shape ApiError
class FakeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message)
  }
}
mock.module('@/lib/api', () => ({ ApiError: FakeApiError }))

const { apiErrorState, formValues } = await import('./form-state')

describe('formValues', () => {
  test('keeps string entries and drops the password', () => {
    const data = new FormData()
    data.set('email', 'a@example.com')
    data.set('password', 'secret')
    data.set('notes', '')
    data.set('file', new File(['x'], 'x.txt'))
    expect(formValues(data)).toEqual({ email: 'a@example.com', notes: '' })
  })
})

describe('apiErrorState', () => {
  const values = { role_title: 'Engineer' }

  test('VALIDATION_FAILED maps field errors and keeps values', () => {
    const error = new FakeApiError(422, 'VALIDATION_FAILED', 'bad', { role_title: ['Field required'] })
    expect(apiErrorState(error, values, 'Could not save.')).toEqual({
      errors: { role_title: ['Field required'] },
      values,
    })
  })

  test('other ApiError gets the fallback message and keeps values', () => {
    const error = new FakeApiError(500, 'INTERNAL_ERROR', 'boom')
    expect(apiErrorState(error, values, 'Could not save.')).toEqual({ message: 'Could not save.', values })
  })

  test('VALIDATION_FAILED without field errors falls back to the message', () => {
    const error = new FakeApiError(422, 'VALIDATION_FAILED', 'bad')
    expect(apiErrorState(error, values, 'Could not save.')).toEqual({ message: 'Could not save.', values })
  })

  test('rethrows anything that is not an ApiError (redirect, notFound)', () => {
    const redirectError = new Error('NEXT_REDIRECT')
    expect(() => apiErrorState(redirectError, values, 'x')).toThrow(redirectError)
  })
})
