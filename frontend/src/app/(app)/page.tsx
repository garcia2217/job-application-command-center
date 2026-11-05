import { Suspense } from 'react'
import { ApplicationsSection } from '@/components/applications/applications-section'
import { AutomationPanel } from '@/components/applications/automation-panel'
import { FollowUpQueue } from '@/components/applications/follow-up-queue'
import { UpcomingList } from '@/components/applications/upcoming-list'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionBoundary } from '@/components/ui/section-boundary'
import { api, ApiError } from '@/lib/api'
import { parseStatus } from '@/lib/application-list'
import { todayTitle } from '@/lib/format'
import { requireSession } from '@/lib/session'
import { homeSubtitle } from '@/lib/summary'

/** null on an API failure, so one failing section doesn't take the page down; anything else (redirects) rethrows. */
function orNull<T>(promise: Promise<T>): Promise<T | null> {
  return promise.catch((error: unknown) => {
    if (!(error instanceof ApiError)) throw error
    return null
  })
}

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  await requireSession()
  // Start the streamed sections' fetches now so they don't wait behind the header's.
  // The no-op catch only marks them handled if the page fails first; the sections
  // still await the original promises and see any rejection.
  const applications = api.applications.list()
  applications.catch(() => {})
  api.settings.jobRuns().catch(() => {})
  // The header needs these; cache() dedupes the sections' own calls to them. A failed
  // quiet or upcoming call only drops the subtitle: its section rethrows into its boundary.
  const [params, me, quiet, upcoming] = await Promise.all([
    searchParams,
    api.auth.me(),
    orNull(api.applications.quiet()),
    orNull(api.stages.upcoming()),
  ])
  const status = parseStatus(params.status)

  return (
    <>
      <PageHeader
        title={todayTitle(new Date(), me.timezone)}
        subtitle={quiet && upcoming ? homeSubtitle(quiet.length, upcoming.length) : null}
      />
      <div className="grid items-start gap-8 desk:grid-cols-[minmax(0,1fr)_var(--spacing-rail)] wide:grid-cols-[minmax(0,1fr)_var(--spacing-rail-wide)]">
        <div className="flex min-w-0 flex-col gap-8">
          <SectionBoundary id="followup-h" title="Needs follow-up">
            <Suspense fallback={<Skeleton rows={3} />}>
              <FollowUpQueue threshold={me.quiet_threshold_days} />
            </Suspense>
          </SectionBoundary>
          <SectionBoundary id="apps-h" title="Applications">
            <Suspense fallback={<Skeleton rows={5} />}>
              <ApplicationsSection applications={applications} status={status} threshold={me.quiet_threshold_days} />
            </Suspense>
          </SectionBoundary>
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <SectionBoundary id="week-h" title="Next 7 days">
            <Suspense fallback={<Skeleton rows={2} />}>
              <UpcomingList timeZone={me.timezone} />
            </Suspense>
          </SectionBoundary>
          <SectionBoundary id="check-h" title="Automation">
            <Suspense fallback={<Skeleton rows={1} variant="block" />}>
              <AutomationPanel timeZone={me.timezone} />
            </Suspense>
          </SectionBoundary>
        </aside>
      </div>
    </>
  )
}
