import { describe, expect, test } from 'bun:test'
import { companyFormValues, deleteCompanyBody, sortByName, websiteHost } from '@/lib/companies'
import type { CompanyResponse } from '@/lib/types'

describe('websiteHost', () => {
  test('drops the protocol, path, query and fragment', () => {
    expect(websiteHost('https://acme.example/careers?x=1#top')).toBe('acme.example')
    expect(websiteHost('http://www.acme.example')).toBe('www.acme.example')
  })

  test('keeps a port', () => {
    expect(websiteHost('https://acme.example:8443/')).toBe('acme.example:8443')
  })

  test('null or blank → null', () => {
    expect(websiteHost(null)).toBeNull()
    expect(websiteHost('  ')).toBeNull()
  })

  test('not a URL → the stored text, unchanged', () => {
    expect(websiteHost('acme dot example')).toBe('acme dot example')
  })
})

describe('sortByName', () => {
  test('case-insensitive, without mutating the input', () => {
    const input = [{ name: 'beta' }, { name: 'Acme' }, { name: 'acorn' }, { name: 'Zeta' }]
    expect(sortByName(input).map((c) => c.name)).toEqual(['Acme', 'acorn', 'beta', 'Zeta'])
    expect(input[0].name).toBe('beta')
  })
})

describe('deleteCompanyBody', () => {
  test('no contacts', () => {
    expect(deleteCompanyBody('Acme', 0)).toBe('Acme will be permanently deleted.')
  })

  test('one contact', () => {
    expect(deleteCompanyBody('Acme', 1)).toBe('Acme and its 1 contact will be permanently deleted.')
  })

  test('several contacts', () => {
    expect(deleteCompanyBody('Acme', 3)).toBe('Acme and its 3 contacts will be permanently deleted.')
  })
})

describe('companyFormValues', () => {
  test('nulls become empty strings', () => {
    const company: CompanyResponse = {
      id: 1,
      name: 'Acme',
      website: null,
      notes: 'Met at a meetup',
      created_at: '2026-11-01T10:00:00Z',
    }
    expect(companyFormValues(company)).toEqual({ name: 'Acme', website: '', notes: 'Met at a meetup' })
  })
})
