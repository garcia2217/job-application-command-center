'use server'

import { revalidatePath } from 'next/cache'
import * as z from 'zod'
import { api } from '@/lib/api'
import { settingsPayload } from '@/lib/payload'
import { requireSession } from '@/lib/session'
import { normalizeLineBreaks } from '@/lib/settings'
import { settingsSchema } from '@/lib/validation'
import { apiErrorState, formValues, type FormState } from './form-state'

const SAVE_FAILED = 'Could not save your settings. Try again.'

export async function updateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  // round-tripped on failure: LF, as the payload sends it and the counter counts it
  if (values.resume_tex !== undefined) values.resume_tex = normalizeLineBreaks(values.resume_tex)
  const parsed = settingsSchema.safeParse(settingsPayload(values))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    // backend field errors (resume_tex limit, unknown timezone, threshold) land on their fields
    await api.settings.update(parsed.data)
  } catch (error) {
    return apiErrorState(error, values, SAVE_FAILED)
  }

  // the threshold shows on home; the time zone changes every displayed date
  revalidatePath('/', 'layout')
  return { ok: true }
}
