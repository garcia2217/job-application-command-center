import Link from 'next/link'
import { cx } from '@/components/ui/cx'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { formatDateOnly, relativeActivity } from '@/lib/format'
import type { ListState } from '@/lib/list-links'
import type { ApplicationSummary } from '@/lib/types'
import { SORT_LABEL, SortHeader, TH_CLASSES } from './sort-header'

type ApplicationsTableProps = {
  applications: ApplicationSummary[]
  /** sortable Applied / Last activity headers (applications list); plain headers on home */
  sort?: ListState
}

const TEXT = 'max-w-0 min-w-24 px-4 py-3 align-middle'
const NUM = 'whitespace-nowrap px-4 py-3 align-middle tabular-nums text-text-muted'

/** Desktop table; hidden below the desk breakpoint, where ApplicationCards take over. */
export function ApplicationsTable({ applications, sort }: ApplicationsTableProps) {
  return (
    <div className="hidden overflow-x-auto desk:block">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr>
            <th scope="col" className={TH_CLASSES}>
              Company
            </th>
            <th scope="col" className={TH_CLASSES}>
              Role
            </th>
            <th scope="col" className={TH_CLASSES}>
              Status
            </th>
            {sort ? (
              <>
                <SortHeader column="date_applied" state={sort} />
                <SortHeader column="last_activity" state={sort} />
              </>
            ) : (
              <>
                <th scope="col" className={TH_CLASSES}>
                  {SORT_LABEL.date_applied}
                </th>
                <th scope="col" className={TH_CLASSES}>
                  {SORT_LABEL.last_activity}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id} className="border-b border-border last:border-b-0 hover:bg-surface-sunken">
              {/* max-w-0 lets the text columns give way first: one line, ellipsis (DESIGN_GUIDE §5 Long text) */}
              <td className={cx(TEXT, 'w-2/5 font-medium')}>
                <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center no-underline">
                  <span className="truncate" title={application.company.name}>
                    {application.company.name}
                  </span>
                  {/* inside the link so its accessible name carries the flag */}
                  {application.is_quiet && (
                    <>
                      <span aria-hidden="true" title="Needs follow-up" className="ml-1.5 flex-none text-label text-warn">
                        ●
                      </span>
                      <VisuallyHidden>, Needs follow-up</VisuallyHidden>
                    </>
                  )}
                </Link>
              </td>
              <td className={cx(TEXT, 'w-3/5 text-text-muted')}>
                <span className="block truncate" title={application.role_title}>
                  {application.role_title}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-middle">
                <StatusIndicator status={application.status} />
              </td>
              <td className={NUM}>{application.date_applied ? formatDateOnly(application.date_applied) : '—'}</td>
              <td className={NUM}>{relativeActivity(application.days_since_activity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
