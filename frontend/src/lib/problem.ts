// Pure: no 'server-only', no next/* imports, so bun test can load it.
export type FieldErrors = Record<string, string[]>

export type Problem = {
  status: number
  code: string
  detail: string
  fieldErrors?: FieldErrors
  existingId?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toFieldErrors(errors: unknown): FieldErrors | undefined {
  if (!Array.isArray(errors)) return undefined
  const out: FieldErrors = {}
  for (const entry of errors) {
    if (!isRecord(entry) || typeof entry.message !== 'string') continue
    const key = typeof entry.field === 'string' && entry.field ? entry.field : '_'
    ;(out[key] ??= []).push(entry.message)
  }
  return Object.keys(out).length ? out : undefined
}

export function parseProblem(status: number, body: unknown): Problem {
  if (!isRecord(body)) return { status, code: 'HTTP_ERROR', detail: 'Request failed' }
  const existing = body.existing_id
  return {
    status,
    code: typeof body.code === 'string' ? body.code : 'HTTP_ERROR',
    detail: typeof body.detail === 'string' ? body.detail : 'Request failed',
    fieldErrors: toFieldErrors(body.errors),
    existingId: Number.isInteger(existing) ? (existing as number) : undefined,
  }
}
