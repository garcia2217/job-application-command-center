import { Suspense } from 'react'
import { SectionHead } from '@/components/ui/section-head'
import { HOME_ROWS, countByStatus, filterByStatus } from '@/lib/application-list'
import { viewAllHref } from '@/lib/list-links'
import type { ApplicationStatus, ApplicationSummary } from '@/lib/types'
import { ApplicationsResults } from './applications-results'
import { StatusFilter, StatusFilterPlaceholder } from './status-filter'

type ApplicationsSectionProps = {
  /** started by the page so it runs alongside the header's fetches */
  applications: Promise<ApplicationSummary[]>
  status: ApplicationStatus | undefined
  threshold: number
}

/** Home's pipeline preview: counts from the full list, the first rows of the filtered one. */
export async function ApplicationsSection({ applications: pending, status, threshold }: ApplicationsSectionProps) {
  const applications = await pending
  const counts = countByStatus(applications)
  const rows = filterByStatus(applications, status).slice(0, HOME_ROWS)

  return (
    <section aria-labelledby="apps-h">
      <SectionHead
        id="apps-h"
        title="Applications"
        link={counts.all > 0 ? { href: viewAllHref(status), label: `View all ${counts.all}` } : undefined}
      />
      {counts.all > 0 && (
        <Suspense fallback={<StatusFilterPlaceholder />}>
          <StatusFilter counts={counts} active={status} />
        </Suspense>
      )}
      <ApplicationsResults rows={rows} total={counts.all} threshold={threshold} clearHref="/" />
    </section>
  )
}
