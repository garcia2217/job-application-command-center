'use server'

import { revalidatePath } from 'next/cache'
import { api, ApiError } from '@/lib/api'
import { positiveInt } from '@/lib/application-detail'
import { requireSession } from '@/lib/session'
import type { FormState } from './form-state'

const CHOOSE_CONTACT = 'Choose a contact.'
const LINK_FAILED = 'Could not link the contact. Try again.'

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
