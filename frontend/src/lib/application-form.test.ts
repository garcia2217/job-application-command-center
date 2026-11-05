import { describe, expect, test } from 'bun:test'
import { applicationFormValues, companyOptions, companyTakenState, NEW_COMPANY } from '@/lib/application-form'
import type { ApplicationDetailResponse } from '@/lib/types'

const detail: ApplicationDetailResponse = {
  id: 12,
  company: { id: 3, name: 'Acme' },
  role_title: 'Backend Engineer',
  status: 'interviewing',
  date_applied: '2026-10-01',
  last_activity_at: '2026-11-01T10:00:00Z',
  is_quiet: false,
  days_since_activity: 4,
  posting_url: 'https://acme.example/jobs/1',
  location: null,
  work_arrangement: 'remote',
  salary_min: 100000,
  salary_max: null,
  salary_currency: 'EUR',
  source: null,
  notes: 'Line one\nLine two',
  job_description: null,
  created_at: '2026-10-01T09:00:00Z',
  stages: [],
  contacts: [],
}

describe('NEW_COMPANY', () => {
  test('is the sentinel payload.ts recognises', () => {
    expect(NEW_COMPANY).toBe('__new__')
  })
})

describe('applicationFormValues', () => {
  test('maps a detail record to form strings, nulls to empty', () => {
    expect(applicationFormValues(detail)).toEqual({
      company_id: '3',
      role_title: 'Backend Engineer',
      status: 'interviewing',
      date_applied: '2026-10-01',
      posting_url: 'https://acme.example/jobs/1',
      location: '',
      work_arrangement: 'remote',
      salary_min: '100000',
      salary_max: '',
      salary_currency: 'EUR',
      source: '',
      job_description: '',
      notes: 'Line one\nLine two',
    })
  })

  test('a salary of 0 stays "0"', () => {
    expect(applicationFormValues({ ...detail, salary_min: 0 }).salary_min).toBe('0')
  })
})

describe('companyOptions', () => {
  const companies = [
    { id: 2, name: 'nimbus' },
    { id: 1, name: 'Acme' },
    { id: 3, name: 'Ledgerly' },
  ]

  test('alphabetical, case-insensitive', () => {
    expect(companyOptions(companies).map((c) => c.name)).toEqual(['Acme', 'Ledgerly', 'nimbus'])
  })

  test('does not mutate its input', () => {
    const copy = [...companies]
    companyOptions(companies)
    expect(companies).toEqual(copy)
  })

  test('adds an existing company missing from the list', () => {
    expect(companyOptions(companies, { id: 9, name: 'Zeta' }).map((c) => c.id)).toEqual([1, 3, 2, 9])
  })

  test('does not duplicate an existing company already listed', () => {
    expect(companyOptions(companies, { id: 1, name: 'Acme' })).toHaveLength(3)
  })
})

describe('companyTakenState', () => {
  const values = { company_id: '__new__', 'company.name': ' acme ', role_title: 'Dev' }
  const companies = [{ id: 1, name: 'Acme' }]

  test('names the existing company and offers it', () => {
    expect(companyTakenState(companies, 1, values)).toEqual({
      existingCompany: { id: 1, name: 'Acme' },
      errors: { 'company.name': ['A company named Acme already exists.'] },
      values,
    })
  })

  test('unknown or missing existing id: the error uses the typed name, no offer', () => {
    const expected = {
      errors: { 'company.name': ['A company named acme already exists.'] },
      values,
    }
    expect(companyTakenState(companies, 99, values)).toEqual(expected)
    expect(companyTakenState(companies, undefined, values)).toEqual(expected)
  })
})
