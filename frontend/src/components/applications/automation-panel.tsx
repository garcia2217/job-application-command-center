import Link from 'next/link'
import { JobRunSummary } from '@/components/settings/job-run-summary'
import { Panel } from '@/components/ui/panel'
import { SectionHead } from '@/components/ui/section-head'
import { api } from '@/lib/api'

export async function AutomationPanel({ timeZone }: { timeZone: string }) {
  const runs = await api.settings.jobRuns()

  return (
    <section aria-labelledby="check-h">
      <SectionHead id="check-h" title="Automation" />
      <Panel padded className="text-meta text-text-muted">
        <JobRunSummary runs={runs} timeZone={timeZone} />
        <p className="mt-3">
          <Link href="/settings/digest-preview" className="font-medium text-accent no-underline hover:underline">
            Preview digest →
          </Link>
        </p>
      </Panel>
    </section>
  )
}
