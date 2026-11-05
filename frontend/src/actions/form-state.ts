// Not a 'use server' file: it exports a type and sync helpers that actions import.
// It loads api.ts (server-only) at runtime, so client code may only `import type` from it.
import { ApiError } from '@/lib/api'
import type { FieldErrors } from '@/lib/problem'

export type FormState = {
  errors?: FieldErrors
  /** form-level InlineAlert */
  message?: string
  values?: Record<string, string>
  /** DUPLICATE_APPLICATION existing_id */
  duplicateOf?: number
  /** COMPANY_NAME_TAKEN */
  existingCompany?: { id: number; name: string }
  /** inline forms that stay on the page (stages, link contact) */
  ok?: boolean
}

/** String entries only, for repopulating a failed form. Never includes the password. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key === 'password' || typeof value !== 'string') continue
    values[key] = value
  }
  return values
}

/**
 * Maps an ApiError to form state. Rethrows anything else so redirect() and
 * notFound() keep working. Callers handle domain codes (409s) before this.
 */
export function apiErrorState(error: unknown, values: Record<string, string>, fallback: string): FormState {
  if (!(error instanceof ApiError)) throw error
  if (error.code === 'VALIDATION_FAILED' && error.fieldErrors) {
    return { errors: error.fieldErrors, values }
  }
  return { message: fallback, values }
}
