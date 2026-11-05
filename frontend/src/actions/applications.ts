'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { companyTakenState } from '@/lib/application-form'
import { applicationPayload } from '@/lib/payload'
import { requireSession } from '@/lib/session'
import type { ApplicationDetailResponse } from '@/lib/types'
import { applicationSchema } from '@/lib/validation'
import { apiErrorState, formValues, type FormState } from './form-state'

const SAVE_FAILED = 'Could not save the application. Try again.'
const DELETE_FAILED = 'Could not delete the application. Try again.'

export async function createApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = applicationSchema('create').safeParse(applicationPayload(values, 'create'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  let created: ApplicationDetailResponse
  try {
    created = await api.applications.create(parsed.data)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    if (error.code === 'DUPLICATE_APPLICATION' && error.existingId !== undefined) {
      return { duplicateOf: error.existingId, values }
    }
    if (error.code === 'COMPANY_NAME_TAKEN') {
      return companyTakenState(await api.companies.list(), error.existingId, values)
    }
    return apiErrorState(error, values, SAVE_FAILED)
  }

  // the layout scope refreshes home, the lists and the nav's quiet badge
  revalidatePath('/', 'layout')
  redirect(`/applications/${created.id}`)
}

// No duplicate branch: the backend checks duplicates on create only.
export async function updateApplication(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = applicationSchema('update').safeParse(applicationPayload(values, 'update'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    await api.applications.update(id, parsed.data)
  } catch (error) {
    return apiErrorState(error, values, SAVE_FAILED)
  }

  revalidatePath('/', 'layout')
  redirect(`/applications/${id}`)
}

// useActionState passes (prev, formData); neither is needed
export async function deleteApplication(id: number): Promise<FormState> {
  await requireSession()
  try {
    await api.applications.remove(id)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    // 404: already deleted (another tab); the outcome the user asked for
    if (error.status !== 404) return { message: DELETE_FAILED }
  }

  revalidatePath('/', 'layout')
  redirect('/applications')
}
