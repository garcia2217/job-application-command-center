/** A database id: a positive safe integer. Anything else must never reach an API path. */
export function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * Throws a plain Error (not ApiError) so a bad id surfaces as an unexpected failure.
 * Ids bound into Server Actions with `.bind` arrive from the client and can be anything.
 */
export function assertId(value: number): number {
  if (!isId(value)) throw new Error('Invalid id')
  return value
}
