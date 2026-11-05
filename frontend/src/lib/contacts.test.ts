import { describe, expect, test } from 'bun:test'
import { contactFormValues, contactReturnHref, newContactContext } from '@/lib/contacts'
import type { ContactResponse } from '@/lib/types'

const companies = [
  { id: 3, name: 'Acme' },
  { id: 5, name: 'Globex' },
]

describe('newContactContext', () => {
  test('a known company_id fixes the company; a valid application_id passes through', () => {
    expect(newContactContext({ company_id: '3', application_id: '12' }, companies)).toEqual({
      company: { id: 3, name: 'Acme' },
      applicationId: 12,
    })
  })

  test('no params: no fixed company, no application', () => {
    expect(newContactContext({}, companies)).toEqual({ company: null, applicationId: null })
  })

  test('an unknown or malformed company_id falls back to the select', () => {
    expect(newContactContext({ company_id: '99' }, companies).company).toBeNull()
    expect(newContactContext({ company_id: 'abc' }, companies).company).toBeNull()
    expect(newContactContext({ company_id: ['3', '5'] }, companies).company).toBeNull()
  })

  test('a malformed application_id is dropped', () => {
    expect(newContactContext({ company_id: '3', application_id: '0' }, companies).applicationId).toBeNull()
    expect(newContactContext({ company_id: '3', application_id: '1.5' }, companies).applicationId).toBeNull()
  })

  test('application_id without a fixed company is dropped (a contact links only within its company)', () => {
    expect(newContactContext({ application_id: '12' }, companies).applicationId).toBeNull()
  })
})

describe('contactReturnHref', () => {
  test('the application when linking, else the company', () => {
    expect(contactReturnHref(3, 12)).toBe('/applications/12')
    expect(contactReturnHref(3, null)).toBe('/companies/3')
  })
})

describe('contactFormValues', () => {
  test('nulls become empty strings; company_id is not an edit field', () => {
    const contact: ContactResponse = {
      id: 7,
      company_id: 3,
      name: 'Dana',
      title: null,
      email: 'dana@acme.example',
      linkedin_url: null,
      notes: null,
      created_at: '2026-11-01T10:00:00Z',
    }
    expect(contactFormValues(contact)).toEqual({
      name: 'Dana',
      title: '',
      email: 'dana@acme.example',
      linkedin_url: '',
      notes: '',
    })
  })
})
