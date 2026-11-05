// Pure helpers for the application detail page and its actions.
import type { ContactResponse } from './types'

const NUMBER = new Intl.NumberFormat('en-GB')

/** "100,000–150,000 EUR"; one value when only one bound is set (or both are equal); null with no salary. */
export function formatSalary(min: number | null, max: number | null, currency: string | null): string | null {
  if (min === null && max === null) return null
  const amount =
    min !== null && max !== null && min !== max
      ? `${NUMBER.format(min)}–${NUMBER.format(max)}`
      : NUMBER.format((min ?? max) as number)
  return currency ? `${amount} ${currency}` : amount
}

/** The company's contacts not yet linked to the application, by name (relinking is pointless, AC-03.3). */
export function linkableContacts(companyContacts: ContactResponse[], linked: ContactResponse[]): ContactResponse[] {
  const linkedIds = new Set(linked.map((contact) => contact.id))
  return companyContacts
    .filter((contact) => !linkedIds.has(contact.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/** A form value that must be a positive integer id; null for anything else. */
export function positiveInt(raw: FormDataEntryValue | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}
