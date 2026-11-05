'use server'

import { refresh } from 'next/cache'
import { api, ApiError } from '@/lib/api'
import { BLOCKED_REASON_TEXT } from '@/lib/labels'
import { requireSession } from '@/lib/session'
import type { FormState } from './form-state'

const RUN_FAILED = 'Could not run the comparison. Try again.'

// Running a comparison is not activity, so only this page is refreshed, not home.
// useActionState passes (prev, formData); neither is needed.
export async function runComparison(appId: number): Promise<FormState> {
  await requireSession()
  try {
    await api.comparisons.run(appId)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    // the page was stale (resume cleared or job description removed elsewhere):
    // refresh it so the disabled state and its reason show
    if (error.code === 'RESUME_REQUIRED') {
      refresh()
      return { message: BLOCKED_REASON_TEXT.no_resume }
    }
    if (error.code === 'JOB_DESCRIPTION_REQUIRED') {
      refresh()
      return { message: BLOCKED_REASON_TEXT.no_job_description }
    }
    return { message: RUN_FAILED }
  }

  refresh()
  return { ok: true }
}
