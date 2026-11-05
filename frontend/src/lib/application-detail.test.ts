import { describe, expect, test } from 'bun:test'
import { formatSalary, linkableContacts, positiveInt } from '@/lib/application-detail'
import type { ContactResponse } from '@/lib/types'

describe('formatSalary', () => {
  test('a range with en-GB grouping and an en dash', () => {
    expect(formatSalary(100000, 150000, 'EUR')).toBe('100,000–150,000 EUR')
  })

  test('a single bound shows one value', () => {
    expect(formatSalary(100000, null, 'EUR')).toBe('100,000 EUR')
    expect(formatSalary(null, 150000, 'USD')).toBe('150,000 USD')
  })

  test('equal bounds show one value', () => {
    expect(formatSalary(90000, 90000, 'GBP')).toBe('90,000 GBP')
  })

  test('zero is a value', () => {
    expect(formatSalary(0, 500, 'EUR')).toBe('0–500 EUR')
  })

  test('no salary → null', () => {
    expect(formatSalary(null, null, 'EUR')).toBeNull()
    expect(formatSalary(null, null, null)).toBeNull()
  })

  test('no currency drops the suffix', () => {
    expect(formatSalary(1000, null, null)).toBe('1,000')
  })
})

function contact(id: number, name: string): ContactResponse {
  return {
    id,
    company_id: 1,
    name,
    title: null,
    email: null,
    linkedin_url: null,
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
  }
}

describe('linkableContacts', () => {
  const company = [contact(1, 'zoe'), contact(2, 'Ann'), contact(3, 'Bo')]

  test('drops contacts already linked (AC-03.3) and sorts by name', () => {
    expect(linkableContacts(company, [contact(3, 'Bo')]).map((c) => c.id)).toEqual([2, 1])
  })

  test('none left → empty', () => {
    expect(linkableContacts(company, company)).toEqual([])
  })

  test('nothing linked → all, sorted', () => {
    expect(linkableContacts(company, []).map((c) => c.name)).toEqual(['Ann', 'Bo', 'zoe'])
  })
})

describe('positiveInt', () => {
  test('plain positive digits', () => {
    expect(positiveInt('7')).toBe(7)
    expect(positiveInt('42')).toBe(42)
  })

  test('anything else → null', () => {
    for (const raw of ['', '0', '-1', '1.5', '1e3', ' 7', 'abc', '07', null, undefined, '99999999999999999999']) {
      expect(positiveInt(raw)).toBeNull()
    }
  })

  test('a File (non-string FormData entry) → null', () => {
    expect(positiveInt(new File(['x'], 'x.txt'))).toBeNull()
  })
})
