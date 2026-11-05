import { formatDateTime } from '@/lib/format'
import { jobRunText } from '@/lib/labels'
import type { JobRunResponse, JobRunsResponse } from '@/lib/types'

function RunLine({ label, run, timeZone }: { label: string; run: JobRunResponse | null; timeZone: string }) {
  return (
    <p>
      {label}: {jobRunText(run)}
      {run && (
        <>
          {' · '}
          <strong className="font-medium text-text">{formatDateTime(run.ran_at, timeZone)}</strong>
        </>
      )}
    </p>
  )
}

/** The latest daily-check and digest run records (F-05). Shared by home's Automation panel and Settings. */
export function JobRunSummary({ runs, timeZone }: { runs: JobRunsResponse; timeZone: string }) {
  return (
    <div className="flex flex-col gap-2">
      <RunLine label="Daily check" run={runs.quiet_check} timeZone={timeZone} />
      <RunLine label="Weekly digest" run={runs.digest} timeZone={timeZone} />
    </div>
  )
}
