import { formatDateTime } from '@/lib/format'
import { jobRunText } from '@/lib/labels'
import type { JobRunResponse, JobRunsResponse, JobType } from '@/lib/types'

type RunLineProps = { label: string; job: JobType; run: JobRunResponse | null; timeZone: string }

function RunLine({ label, job, run, timeZone }: RunLineProps) {
  return (
    <p>
      {label}: {jobRunText(run, job)}
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
      <RunLine label="Daily check" job="quiet_check" run={runs.quiet_check} timeZone={timeZone} />
      <RunLine label="Weekly digest" job="digest" run={runs.digest} timeZone={timeZone} />
    </div>
  )
}
