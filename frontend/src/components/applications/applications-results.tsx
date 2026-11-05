import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import type { ListState } from '@/lib/list-links'
import type { ApplicationSummary } from '@/lib/types'
import { ApplicationCards } from './application-cards'
import { ApplicationsTable } from './applications-table'

type ApplicationsResultsProps = {
  /** the rows to show: already filtered and sliced */
  rows: ApplicationSummary[]
  /** every application on the account, before filtering */
  total: number
  threshold: number
  /** "Clear filter" target for the filtered-empty state */
  clearHref: string
  sort?: ListState
}

/** Table (desk) and cards (mobile) in one Panel, or the first-use / filtered-empty state. */
export function ApplicationsResults({ rows, total, threshold, clearHref, sort }: ApplicationsResultsProps) {
  if (total === 0) {
    return (
      <Panel>
        <EmptyState
          title="No applications yet"
          body="Log one to start tracking it."
          action={{ href: '/applications/new', label: 'Add your first application' }}
        />
      </Panel>
    )
  }
  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState title="No applications with this status." action={{ href: clearHref, label: 'Clear filter' }} />
      </Panel>
    )
  }
  return (
    <Panel>
      <ApplicationsTable applications={rows} sort={sort} />
      <ApplicationCards applications={rows} threshold={threshold} />
    </Panel>
  )
}
