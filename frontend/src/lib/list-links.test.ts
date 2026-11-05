import { describe, expect, test } from 'bun:test'
import { ariaSort, pageHref, sortHref, statusHref, viewAllHref } from '@/lib/list-links'

describe('statusHref', () => {
  test('sets the status and keeps the other params', () => {
    expect(statusHref('/applications', 'sort=date_applied&order=asc', 'offer')).toBe(
      '/applications?sort=date_applied&order=asc&status=offer',
    )
  })

  test('All removes the status', () => {
    expect(statusHref('/', 'status=offer', 'all')).toBe('/')
    expect(statusHref('/applications', 'status=offer&sort=date_applied', 'all')).toBe(
      '/applications?sort=date_applied',
    )
  })

  test('changing the filter resets the page', () => {
    expect(statusHref('/applications', 'page=3&status=applied', 'offer')).toBe('/applications?status=offer')
  })
})

describe('sortHref', () => {
  test('the active column flips the order', () => {
    expect(sortHref({ sort: 'last_activity', order: 'desc' }, 'last_activity')).toBe(
      '/applications?sort=last_activity&order=asc',
    )
    expect(sortHref({ sort: 'last_activity', order: 'asc' }, 'last_activity')).toBe(
      '/applications?sort=last_activity&order=desc',
    )
  })

  test('the other column starts descending', () => {
    expect(sortHref({ sort: 'last_activity', order: 'asc' }, 'date_applied')).toBe(
      '/applications?sort=date_applied&order=desc',
    )
  })

  test('keeps the status filter', () => {
    expect(sortHref({ status: 'applied', sort: 'date_applied', order: 'desc' }, 'last_activity')).toBe(
      '/applications?status=applied&sort=last_activity&order=desc',
    )
  })
})

describe('ariaSort', () => {
  test('active column reports its direction, the other none', () => {
    expect(ariaSort({ sort: 'last_activity', order: 'desc' }, 'last_activity')).toBe('descending')
    expect(ariaSort({ sort: 'last_activity', order: 'asc' }, 'last_activity')).toBe('ascending')
    expect(ariaSort({ sort: 'last_activity', order: 'desc' }, 'date_applied')).toBe('none')
  })
})

describe('pageHref', () => {
  test('keeps status, sort and order', () => {
    expect(pageHref({ status: 'offer', sort: 'date_applied', order: 'asc' }, 2)).toBe(
      '/applications?status=offer&sort=date_applied&order=asc&page=2',
    )
  })

  test('page 1 drops the page param', () => {
    expect(pageHref({ sort: 'last_activity', order: 'desc' }, 1)).toBe(
      '/applications?sort=last_activity&order=desc',
    )
  })
})

describe('viewAllHref', () => {
  test('carries the status when set', () => {
    expect(viewAllHref(undefined)).toBe('/applications')
    expect(viewAllHref('interviewing')).toBe('/applications?status=interviewing')
  })
})
