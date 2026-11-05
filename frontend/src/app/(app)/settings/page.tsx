import { Suspense } from 'react'
import { AutomationPanel } from '@/components/applications/automation-panel'
import { SettingsForm } from '@/components/settings/settings-form'
import { PageHeader } from '@/components/ui/page-header'
import { SectionBoundary } from '@/components/ui/section-boundary'
import { SectionHead } from '@/components/ui/section-head'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { requireSession } from '@/lib/session'
import { settingsFormValues, timezoneOptions } from '@/lib/settings'

export default async function SettingsPage() {
  await requireSession()
  // Started now, awaited inside the Automation boundary: a failing run lookup
  // alerts only that section, never the form. The no-op catch only marks it
  // handled if the page fails first.
  api.settings.jobRuns().catch(() => {})
  const settings = await api.settings.get()
  const timezones = timezoneOptions(settings.timezone, Intl.supportedValuesOf('timeZone'))
  // resume_updated_at also records a clear, so only show it while there is a resume
  const resumeSaved =
    settings.has_resume && settings.resume_updated_at
      ? `Last saved ${formatDateTime(settings.resume_updated_at, settings.timezone)}`
      : null

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`${settings.email}${settings.is_demo ? ' · demo account' : ''}`}
      />
      <div className="flex max-w-form flex-col gap-8">
        <SettingsForm initial={settingsFormValues(settings)} timezones={timezones} resumeSaved={resumeSaved} />
        <SectionBoundary id="check-h" title="Automation">
          <Suspense
            fallback={
              <section aria-labelledby="check-h">
                <SectionHead id="check-h" title="Automation" />
                <Skeleton rows={1} variant="block" />
              </section>
            }
          >
            <AutomationPanel timeZone={settings.timezone} />
          </Suspense>
        </SectionBoundary>
      </div>
    </>
  )
}
