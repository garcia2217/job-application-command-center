import { describe, expect, test } from 'bun:test'
import {
  HOME_ROWS,
  PAGE_SIZE,
  countByStatus,
  filterByStatus,
  paginate,
  parseOrder,
  parsePage,
  parseSort,
  parseStatus,
} from '@/lib/application-list'
import type { ApplicationStatus, ApplicationSummary } from '@/lib/types'

function app(id: number, status: ApplicationStatus, is_quiet = false): ApplicationSummary {
  return {
    id,
    company: { id: 1, name: `Company ${id}` },
    role_title: 'Engineer',
    status,
    date_applied: null,
    last_activity_at: '2026-11-01T10:00:00Z',
    is_quiet,
    days_since_activity: 4,
  }
}

describe('parseStatus', () => {
  test('accepts each of the six statuses', () => {
    expect(parseStatus('applied')).toBe('applied')
    expect(parseStatus('withdrawn')).toBe('withdrawn')
  })

  test('ignores anything else', () => {
    expect(parseStatus(undefined)).toBeUndefined()
    expect(parseStatus('')).toBeUndefined()
    expect(parseStatus('all')).toBeUndefined()
    expect(parseStatus('Applied')).toBeUndefined()
    expect(parseStatus(['applied', 'offer'])).toBeUndefined()
  })
})

describe('parseSort and parseOrder', () => {
  test('default to last activity, newest first', () => {
    expect(parseSort(undefined)).toBe('last_activity')
    expect(parseOrder(undefined)).toBe('desc')
  })

  test('accept the allowed values', () => {
    expect(parseSort('date_applied')).toBe('date_applied')
    expect(parseOrder('asc')).toBe('asc')
  })

  test('fall back on unknown values', () => {
    expect(parseSort('role_title')).toBe('last_activity')
    expect(parseOrder('up')).toBe('desc')
    expect(parseSort(['date_applied'])).toBe('last_activity')
  })
})

describe('parsePage', () => {
  test('positive integers only, default 1', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('3')).toBe(3)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('2.5')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('99999999999999999999')).toBe(1)
    expect(parsePage(['2'])).toBe(1)
  })
})

describe('countByStatus', () => {
  test('counts every status plus all, zero for missing ones', () => {
    const counts = countByStatus([app(1, 'applied'), app(2, 'applied'), app(3, 'offer')])
    expect(counts).toEqual({
      all: 3,
      wishlist: 0,
      applied: 2,
      interviewing: 0,
      offer: 1,
      rejected: 0,
      withdrawn: 0,
    })
  })

  test('empty list counts zero everywhere', () => {
    expect(countByStatus([]).all).toBe(0)
  })
})

describe('filterByStatus', () => {
  const apps = [app(1, 'applied'), app(2, 'offer'), app(3, 'applied')]

  test('no status keeps everything in order', () => {
    expect(filterByStatus(apps, undefined).map((a) => a.id)).toEqual([1, 2, 3])
  })

  test('keeps only the given status, in order', () => {
    expect(filterByStatus(apps, 'applied').map((a) => a.id)).toEqual([1, 3])
    expect(filterByStatus(apps, 'rejected')).toEqual([])
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 120 }, (_, i) => i + 1)

  test('50 per page by default', () => {
    expect(PAGE_SIZE).toBe(50)
    const first = paginate(items, 1)
    expect(first.rows).toHaveLength(50)
    expect(first.rows[0]).toBe(1)
    expect(first).toMatchObject({ page: 1, pageCount: 3 })
  })

  test('the last page holds the remainder', () => {
    const last = paginate(items, 3)
    expect(last.rows).toEqual(items.slice(100))
    expect(last.page).toBe(3)
  })

  test('a page past the end clamps to the last page', () => {
    const clamped = paginate(items, 9)
    expect(clamped.page).toBe(3)
    expect(clamped.rows[0]).toBe(101)
  })

  test('exactly one full page is a single page', () => {
    expect(paginate(items.slice(0, 50), 1).pageCount).toBe(1)
    expect(paginate(items.slice(0, 51), 1).pageCount).toBe(2)
  })

  test('an empty list is one empty page', () => {
    expect(paginate([], 4)).toEqual({ rows: [], page: 1, pageCount: 1 })
  })

  test('custom size, used for the home preview', () => {
    expect(HOME_ROWS).toBe(10)
    expect(paginate(items, 1, HOME_ROWS).rows).toEqual(items.slice(0, 10))
  })
})
