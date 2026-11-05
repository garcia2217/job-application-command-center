import { APPLICATION_STATUSES, type ApplicationStatus, type ApplicationSummary } from './types'

export const APPLICATION_SORTS = ['last_activity', 'date_applied'] as const
export type ApplicationSort = (typeof APPLICATION_SORTS)[number]
export type SortOrder = 'asc' | 'desc'

export const PAGE_SIZE = 50
export const HOME_ROWS = 10

/** A raw `searchParams` value: repeated keys arrive as arrays and are treated as invalid. */
type RawParam = string | string[] | undefined

export function parseStatus(raw: RawParam): ApplicationStatus | undefined {
  return typeof raw === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(raw)
    ? (raw as ApplicationStatus)
    : undefined
}

export function parseSort(raw: RawParam): ApplicationSort {
  return raw === 'date_applied' ? 'date_applied' : 'last_activity'
}

export function parseOrder(raw: RawParam): SortOrder {
  return raw === 'asc' ? 'asc' : 'desc'
}

export function parsePage(raw: RawParam): number {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) return 1
  const page = Number(raw)
  return Number.isSafeInteger(page) ? page : 1
}

export type StatusCounts = Record<ApplicationStatus | 'all', number>

export function countByStatus(applications: ApplicationSummary[]): StatusCounts {
  const counts = { all: applications.length } as StatusCounts
  for (const status of APPLICATION_STATUSES) counts[status] = 0
  for (const application of applications) counts[application.status] += 1
  return counts
}

export function filterByStatus(
  applications: ApplicationSummary[],
  status: ApplicationStatus | undefined,
): ApplicationSummary[] {
  return status ? applications.filter((application) => application.status === status) : applications
}

export type PageSlice<T> = { rows: T[]; page: number; pageCount: number }

/** 1-based page, clamped to the last page; an empty list is one empty page. */
export function paginate<T>(items: T[], page: number, size: number = PAGE_SIZE): PageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * size
  return { rows: items.slice(start, start + size), page: current, pageCount }
}
