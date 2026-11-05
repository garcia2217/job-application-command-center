import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ComparisonSection } from '@/components/comparison/comparison-panel'
import { ApplicationDetails } from '@/components/applications/application-details'
import { DeleteApplication } from '@/components/applications/delete-application'
import { JobDescription } from '@/components/applications/job-description'
import { LinkedContacts } from '@/components/contacts/linked-contacts'
import { InterviewStages } from '@/components/stages/interview-stages'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { SectionBoundary } from '@/components/ui/section-boundary'
import { SectionHead } from '@/components/ui/section-head'
import { SilentBadge } from '@/components/ui/silent-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { api, ApiError, parseId } from '@/lib/api'
import { relativeActivity } from '@/lib/format'
import { requireSession } from '@/lib/session'

export default async function ApplicationPage({ params }: PageProps<'/applications/[id]'>) {
  await requireSession()
  const id = parseId((await params).id)
  // Started alongside the application and awaited inside its own boundary, so a
  // failing comparison only alerts that section. The no-op catch keeps a rejection
  // from going unhandled when the page bails out first (404, expired session).
  const comparison = api.comparisons.get(id)
  comparison.catch(() => {})
  const [application, me] = await Promise.all([
    api.applications.get(id).catch((error: unknown) => {
      // AC-01.7: another account's record is a 404 too
      if (error instanceof ApiError && error.status === 404) notFound()
      throw error
    }),
    api.auth.me(),
  ])
  const { company } = application
  const name = `${company.name} · ${application.role_title}`

  return (
    <>
      <PageHeader
        title={
          <span className="break-words">
            <Link href={`/companies/${company.id}`} className="text-text no-underline hover:underline">
              {company.name}
            </Link>{' '}
            · {application.role_title}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <StatusIndicator status={application.status} />
            {application.is_quiet && (
              <SilentBadge days={application.days_since_activity} threshold={me.quiet_threshold_days} />
            )}
            <span className="text-meta">
              Last activity {relativeActivity(application.days_since_activity).toLowerCase()}
            </span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/applications/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
            <DeleteApplication id={id} name={name} />
          </>
        }
      />
      <div className="grid items-start gap-8 desk:grid-cols-[minmax(0,1fr)_var(--spacing-rail)] wide:grid-cols-[minmax(0,1fr)_var(--spacing-rail-wide)]">
        <div className="flex min-w-0 flex-col gap-8">
          <SectionBoundary id="comparison-h" title="Comparison">
            <Suspense
              fallback={
                <section aria-labelledby="comparison-h">
                  <SectionHead id="comparison-h" title="Comparison" />
                  <Skeleton rows={2} variant="block" />
                </section>
              }
            >
              <ComparisonSection state={comparison} appId={id} timezone={me.timezone} />
            </Suspense>
          </SectionBoundary>
          <SectionBoundary id="stages-h" title="Interview stages">
            <InterviewStages appId={id} stages={application.stages} timezone={me.timezone} />
          </SectionBoundary>
          <JobDescription text={application.job_description} editHref={`/applications/${id}/edit`} />
        </div>
        <aside className="flex min-w-0 flex-col gap-8">
          <ApplicationDetails application={application} />
          <SectionBoundary id="contacts-h" title="Contacts">
            <Suspense fallback={<Skeleton rows={2} />}>
              <LinkedContacts appId={id} companyId={company.id} contacts={application.contacts} />
            </Suspense>
          </SectionBoundary>
        </aside>
      </div>
    </>
  )
}
