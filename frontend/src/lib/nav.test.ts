import { describe, expect, test } from 'bun:test'
import { NAV_ITEMS, hasOwnPrimary, isActive } from '@/lib/nav'

describe('NAV_ITEMS', () => {
  test('five destinations in guide order', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['Home', 'Applications', 'Companies', 'Contacts', 'Settings'])
  })
})

describe('isActive', () => {
  test.each([
    ['/', '/', true],
    ['/', '/applications', false],
    ['/applications', '/applications', true],
    ['/applications', '/applications/12', true],
    ['/applications', '/applications/12/edit', true],
    ['/applications', '/applicationsx', false],
    ['/settings', '/settings/digest-preview', true],
    ['/companies', '/contacts', false],
  ])('isActive(%p, %p) → %p', (href, pathname, expected) => {
    expect(isActive(href, pathname)).toBe(expected)
  })
})

describe('hasOwnPrimary', () => {
  test.each([
    '/applications/new',
    '/applications/12',
    '/applications/12/edit',
    '/companies/new',
    '/companies/3/edit',
    '/contacts/new',
    '/contacts/5/edit',
    '/settings',
  ])('%p has its own primary', (pathname) => {
    expect(hasOwnPrimary(pathname)).toBe(true)
  })

  test.each(['/', '/applications', '/companies', '/companies/3', '/contacts', '/settings/digest-preview'])(
    '%p does not',
    (pathname) => {
      expect(hasOwnPrimary(pathname)).toBe(false)
    },
  )
})
