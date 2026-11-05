import { Suspense } from 'react'
import { ApplicationsResults } from '@/components/applications/applications-results'
import { Pagination } from '@/components/applications/pagination'
import { SortLinks } from '@/components/applications/sort-header'
import { StatusFilter, StatusFilterPlaceholder } from '@/components/applications/status-filter'
import { PageHeader } from '@/components/ui/page-header'
import { api } from '@/lib/api'
import {
  countByStatus,
  filterByStatus,
  paginate,
  parseOrder,
  parsePage,
  parseSort,
  parseStatus,
} from '@/lib/application-list'
import type { ListState } from '@/lib/list-links'
import { requireSession } from '@/lib/session'
import { applicationsSubtitle } from '@/lib/summary'

export default async function ApplicationsPage({ searchParams }: PageProps<'/applications'>) {
  await requireSession()
  const params = await searchParams
  const state: ListState = {
    status: parseStatus(params.status),
    sort: parseSort(params.sort),
    order: parseOrder(params.order),
  }
  const [applications, me] = await Promise.all([
    api.applications.list({ sort: state.sort, order: state.order }),
    api.auth.me(),
  ])
  const counts = countByStatus(applications)
  const quietCount = applications.filter((application) => application.is_quiet).length
  const { rows, page, pageCount } = paginate(filterByStatus(applications, state.status), parsePage(params.page))

  return (
    <>
      <PageHeader title="Applications" subtitle={applicationsSubtitle(counts.all, quietCount)} />
      {counts.all > 0 && (
        <>
          <Suspense fallback={<StatusFilterPlaceholder />}>
            <StatusFilter counts={counts} active={state.status} />
          </Suspense>
          {rows.length > 0 && <SortLinks state={state} />}
        </>
      )}
      <ApplicationsResults
        rows={rows}
        total={counts.all}
        threshold={me.quiet_threshold_days}
        clearHref="/applications"
        sort={state}
      />
      <Pagination page={page} pageCount={pageCount} state={state} />
    </>
  )
}
