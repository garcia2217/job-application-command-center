// Pure helpers for the companies screens.
import type { CompanyResponse } from './types'

/** The website's host for list rows ("acme.example"); unparseable text is shown as stored. */
export function websiteHost(website: string | null): string | null {
  const text = website?.trim()
  if (!text) return null
  try {
    return new URL(text).host || text
  } catch {
    return text
  }
}

/** Alphabetical by name, case-insensitive; returns a new array. */
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/** The delete confirmation's body: deleting a company deletes its contacts too. */
export function deleteCompanyBody(name: string, contactCount: number): string {
  if (contactCount === 0) return `${name} will be permanently deleted.`
  const contacts = contactCount === 1 ? '1 contact' : `${contactCount} contacts`
  return `${name} and its ${contacts} will be permanently deleted.`
}

/** The edit form's initial values, keyed by the API field names. */
export function companyFormValues(company: CompanyResponse): Record<string, string> {
  return { name: company.name, website: company.website ?? '', notes: company.notes ?? '' }
}
