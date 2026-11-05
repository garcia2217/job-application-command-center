import { describe, expect, test } from 'bun:test'
import { applicationsSubtitle, companiesSubtitle, contactsSubtitle, homeSubtitle } from '@/lib/summary'

describe('homeSubtitle', () => {
  test('both halves, plural', () => {
    expect(homeSubtitle(3, 2)).toBe('3 applications have gone quiet · 2 interviews in the next 7 days')
  })

  test('singular forms', () => {
    expect(homeSubtitle(1, 1)).toBe('1 application has gone quiet · 1 interview in the next 7 days')
  })

  test('a zero half is omitted', () => {
    expect(homeSubtitle(0, 2)).toBe('2 interviews in the next 7 days')
    expect(homeSubtitle(4, 0)).toBe('4 applications have gone quiet')
  })

  test('no line when both are zero', () => {
    expect(homeSubtitle(0, 0)).toBeNull()
  })
})

describe('applicationsSubtitle', () => {
  test('total and quiet count', () => {
    expect(applicationsSubtitle(14, 3)).toBe('14 applications · 3 quiet')
  })

  test('singular application', () => {
    expect(applicationsSubtitle(1, 1)).toBe('1 application · 1 quiet')
  })

  test('drops a zero quiet count', () => {
    expect(applicationsSubtitle(8, 0)).toBe('8 applications')
    expect(applicationsSubtitle(0, 0)).toBe('0 applications')
  })
})

describe('companiesSubtitle', () => {
  test('plural and singular', () => {
    expect(companiesSubtitle(4)).toBe('4 companies')
    expect(companiesSubtitle(1)).toBe('1 company')
    expect(companiesSubtitle(0)).toBe('0 companies')
  })
})

describe('contactsSubtitle', () => {
  test('plural and singular', () => {
    expect(contactsSubtitle(4)).toBe('4 contacts')
    expect(contactsSubtitle(1)).toBe('1 contact')
    expect(contactsSubtitle(0)).toBe('0 contacts')
  })
})
