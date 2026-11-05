import type { ApplicationSort, SortOrder } from './application-list'
import type { ApplicationStatus } from './types'

export type ListState = {
  status?: ApplicationStatus
  sort: ApplicationSort
  order: SortOrder
}

const LIST_PATH = '/applications'

function withQuery(pathname: string, params: URLSearchParams): string {
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

function stateParams({ status, sort, order }: ListState): URLSearchParams {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('sort', sort)
  params.set('order', order)
  return params
}

/** StatusFilter target: keeps the other params, drops `page` (a new filter starts at page 1). */
export function statusHref(pathname: string, current: string, status: ApplicationStatus | 'all'): string {
  const params = new URLSearchParams(current)
  params.delete('page')
  if (status === 'all') params.delete('status')
  else params.set('status', status)
  return withQuery(pathname, params)
}

/** The active column flips its order; the other column starts descending. Drops `page`. */
export function sortHref(state: ListState, column: ApplicationSort): string {
  const order: SortOrder = state.sort === column ? (state.order === 'desc' ? 'asc' : 'desc') : 'desc'
  return withQuery(LIST_PATH, stateParams({ ...state, sort: column, order }))
}

export function ariaSort(state: ListState, column: ApplicationSort): 'ascending' | 'descending' | 'none' {
  if (state.sort !== column) return 'none'
  return state.order === 'asc' ? 'ascending' : 'descending'
}

export function pageHref(state: ListState, page: number): string {
  const params = stateParams(state)
  if (page > 1) params.set('page', String(page))
  return withQuery(LIST_PATH, params)
}

export function viewAllHref(status: ApplicationStatus | undefined): string {
  return status ? `${LIST_PATH}?status=${status}` : LIST_PATH
}
