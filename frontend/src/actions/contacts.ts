'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { positiveInt } from '@/lib/application-detail'
import { contactReturnHref } from '@/lib/contacts'
import { contactPayload } from '@/lib/payload'
import { requireSession } from '@/lib/session'
import type { ContactResponse } from '@/lib/types'
import { contactSchema } from '@/lib/validation'
import { apiErrorState, formValues, type FormState } from './form-state'

const CHOOSE_CONTACT = 'Choose a contact.'
const LINK_FAILED = 'Could not link the contact. Try again.'
const SAVE_FAILED = 'Could not save the contact. Try again.'
const DELETE_FAILED = 'Could not delete the contact. Try again.'
const SAVED_NOT_LINKED = 'The contact was saved but could not be linked. Link it from the application.'

export async function createContact(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = contactSchema.safeParse(contactPayload(values, 'create'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }
  const { company_id: companyId, name, ...rest } = parsed.data
  if (companyId === undefined) return { errors: { company_id: ['Choose a company.'] }, values }

  let created: ContactResponse
  try {
    created = await api.contacts.create({ ...rest, company_id: companyId, name: name ?? '' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // the company was deleted since the page loaded
      return { message: 'This company was deleted. Choose another company.', values }
    }
    return apiErrorState(error, values, SAVE_FAILED)
  }

  revalidatePath('/contacts')
  revalidatePath(`/companies/${companyId}`)

  const applicationId = positiveInt(values.application_id)
  if (applicationId !== null) {
    try {
      await api.contacts.link(applicationId, created.id)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      // never lose the created contact silently; no values, so a resubmit can't duplicate it unnoticed
      return { message: SAVED_NOT_LINKED }
    }
    revalidatePath(`/applications/${applicationId}`)
  }

  redirect(contactReturnHref(companyId, applicationId))
}

export async function updateContact(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const values = formValues(formData)
  const parsed = contactSchema.safeParse(contactPayload(values, 'update'))
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values }

  try {
    await api.contacts.update(id, parsed.data)
  } catch (error) {
    return apiErrorState(error, values, SAVE_FAILED)
  }

  // contacts show on the list, the company and every application they're linked to
  revalidatePath('/', 'layout')
  redirect('/contacts')
}

// useActionState passes (prev, formData); neither is needed
export async function deleteContact(id: number): Promise<FormState> {
  await requireSession()
  try {
    await api.contacts.remove(id)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    // 404: already deleted (another tab); the outcome the user asked for
    if (error.status !== 404) return { message: DELETE_FAILED }
  }

  // AC-03.6: the backend removes its application links; refresh those pages too
  revalidatePath('/', 'layout')
  redirect('/contacts')
}

// Linking is not activity on the backend, so only the detail page needs refreshing.
export async function linkContact(appId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireSession()
  const contactId = positiveInt(formData.get('contact_id'))
  if (contactId === null) return { errors: { contact_id: [CHOOSE_CONTACT] } }

  try {
    await api.contacts.link(appId, contactId)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    // AC-03.2: unreachable from the select, but this action is a public endpoint
    if (error.code === 'CONTACT_COMPANY_MISMATCH') {
      return { errors: { contact_id: ['This contact works at a different company.'] } }
    }
    if (error.status === 404) return { errors: { contact_id: [CHOOSE_CONTACT] } }
    return { message: LINK_FAILED }
  }

  revalidatePath(`/applications/${appId}`)
  return { ok: true }
}

export async function unlinkContact(appId: number, contactId: number): Promise<void> {
  await requireSession()
  try {
    await api.contacts.unlink(appId, contactId)
  } catch (error) {
    // 404: already unlinked or gone; the page refresh below shows the current state
    if (!(error instanceof ApiError) || error.status !== 404) throw error
  }
  revalidatePath(`/applications/${appId}`)
}
