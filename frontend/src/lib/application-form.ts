// Pure helpers for the add/edit application form and its Server Actions.
import type { FormState } from '@/actions/form-state'
import type { ApplicationDetailResponse, CompanyRef } from './types'

/** The company select's "New company…" value; payload.ts maps it to an inline `company`. */
export const NEW_COMPANY = '__new__'

const text = (value: string | number | null) => (value === null ? '' : String(value))

/** The edit form's initial values, keyed by the form's field names (the API's). */
export function applicationFormValues(application: ApplicationDetailResponse): Record<string, string> {
  return {
    company_id: String(application.company.id),
    role_title: application.role_title,
    status: application.status,
    date_applied: text(application.date_applied),
    posting_url: text(application.posting_url),
    location: text(application.location),
    work_arrangement: text(application.work_arrangement),
    salary_min: text(application.salary_min),
    salary_max: text(application.salary_max),
    salary_currency: text(application.salary_currency),
    source: text(application.source),
    job_description: text(application.job_description),
    notes: text(application.notes),
  }
}

/**
 * Select options, alphabetical. `extra` is the company a COMPANY_NAME_TAKEN
 * response pointed at; it is appended if the page's list predates it.
 */
export function companyOptions(companies: CompanyRef[], extra?: CompanyRef): CompanyRef[] {
  const sorted = [...companies].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  if (extra && !sorted.some((company) => company.id === extra.id)) sorted.push(extra)
  return sorted
}

/** COMPANY_NAME_TAKEN on an inline "New company…": the field error, plus the existing company to switch to when known. */
export function companyTakenState(
  companies: CompanyRef[],
  existingId: number | undefined,
  values: Record<string, string>,
): FormState {
  const existing = companies.find((company) => company.id === existingId)
  const name = existing?.name ?? (values['company.name'] ?? '').trim()
  return {
    ...(existing ? { existingCompany: { id: existing.id, name: existing.name } } : {}),
    errors: { 'company.name': [`A company named ${name} already exists.`] },
    values,
  }
}
