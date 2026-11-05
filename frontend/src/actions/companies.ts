'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { companyTakenState } from '@/lib/application-form'
import { companyPayload } from '@/lib/payload'
import { requireSession } from '@/lib/session'
import type { CompanyResponse } from '@/lib/types'
import { companySchema } from '@/lib/validation'
import { apiErrorState, formValues, type FormState } from './form-state'

const SAVE_FAILED = 'Could not save the company. Try again.'
const DELETE_FAILED = 'Could not delete the company. Try again.'
const HAS_APPLICATIONS = "Delete or move this company's applications first."

// For naming the existing company only: if the lookup fails, the form still gets
// the field error with the typed name, just without the "View {name}" link.
async function companiesOrNone(): Promise<CompanyResponse[]> {
  try {
    return await api.companies.list()
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    return []
  }
}

async function nameTaken(error: ApiError, values: Record<string, string>): Promise<FormState> {
  return companyTakenState(await companiesOrNone(), error.existingId, values, 'name')
}

export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = companySchema.safeParse(companyPayload(values, 'create'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  let created: CompanyResponse
  try {
    // create mode always sends a name ('' is caught by zod above)
    created = await api.companies.create({ ...parsed.data, name: parsed.data.name ?? '' })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'COMPANY_NAME_TAKEN') return nameTaken(error, values)
    return apiErrorState(error, values, SAVE_FAILED)
  }

  revalidatePath('/companies')
  redirect(`/companies/${created.id}`)
}

export async function updateCompany(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = companySchema.safeParse(companyPayload(values, 'update'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    await api.companies.update(id, parsed.data)
  } catch (error) {
    if (error instanceof ApiError && error.code === 'COMPANY_NAME_TAKEN') return nameTaken(error, values)
    return apiErrorState(error, values, SAVE_FAILED)
  }

  // company names appear on application rows everywhere
  revalidatePath('/', 'layout')
  redirect(`/companies/${id}`)
}

// useActionState passes (prev, formData); neither is needed
export async function deleteCompany(id: number): Promise<FormState> {
  await requireSession()
  try {
    await api.companies.remove(id)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    // AC-02.6: applications were added since the page loaded
    if (error.code === 'COMPANY_HAS_APPLICATIONS') return { message: HAS_APPLICATIONS }
    // 404: already deleted (another tab); the outcome the user asked for
    if (error.status !== 404) return { message: DELETE_FAILED }
  }

  revalidatePath('/', 'layout')
  redirect('/companies')
}
