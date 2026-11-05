// Pure helpers for the contact form and its actions.
import { positiveInt } from './application-detail'
import type { CompanyRef, ContactResponse } from './types'

type Param = string | string[] | undefined

export type NewContactContext = {
  /** fixed when arriving from a company or application page (a contact belongs to one company) */
  company: CompanyRef | null
  /** the application to link the new contact to */
  applicationId: number | null
}

const single = (value: Param) => (typeof value === 'string' ? value : undefined)

/** `/contacts/new?company_id=&application_id=` → what the form fixes and passes through. */
export function newContactContext(
  params: { company_id?: Param; application_id?: Param },
  companies: CompanyRef[],
): NewContactContext {
  const companyId = positiveInt(single(params.company_id))
  const found = companies.find((company) => company.id === companyId)
  const company = found ? { id: found.id, name: found.name } : null
  // linking needs the application's company, so it only travels with a fixed company
  const applicationId = company ? positiveInt(single(params.application_id)) : null
  return { company, applicationId }
}

/** Where a new contact's save (and Cancel) returns to. */
export function contactReturnHref(companyId: number, applicationId: number | null): string {
  return applicationId !== null ? `/applications/${applicationId}` : `/companies/${companyId}`
}

/** The edit form's initial values; the company is fixed on edit (ContactUpdate has no company_id). */
export function contactFormValues(contact: ContactResponse): Record<string, string> {
  return {
    name: contact.name,
    title: contact.title ?? '',
    email: contact.email ?? '',
    linkedin_url: contact.linkedin_url ?? '',
    notes: contact.notes ?? '',
  }
}
