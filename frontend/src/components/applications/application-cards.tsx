import Link from 'next/link'
import { SilentBadge } from '@/components/ui/silent-badge'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { relativeActivity } from '@/lib/format'
import type { ApplicationSummary } from '@/lib/types'

type ApplicationCardsProps = {
  applications: ApplicationSummary[]
  /** account quiet threshold, for the SilentBadge tone */
  threshold: number
}

/** Mobile cards; hidden from the desk breakpoint up, where ApplicationsTable takes over. */
export function ApplicationCards({ applications, threshold }: ApplicationCardsProps) {
  return (
    <ul className="divide-y divide-border desk:hidden">
      {applications.map((application) => (
        <li key={application.id}>
          <Link href={`/applications/${application.id}`} className="block px-4 py-3 no-underline hover:bg-surface-sunken">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 truncate text-section font-medium">{application.company.name}</span>
              {application.is_quiet && (
                <SilentBadge days={application.days_since_activity} threshold={threshold} compact />
              )}
            </span>
            <span className="block truncate text-body text-text-muted">{application.role_title}</span>
            <span className="mt-2 flex flex-wrap gap-3 text-meta text-text-faint">
              <StatusIndicator status={application.status} />
              <span>Last activity {relativeActivity(application.days_since_activity).toLowerCase()}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
