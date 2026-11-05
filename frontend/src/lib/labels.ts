import type { ApplicationStatus, BlockedReason, JobRunResponse, JobType, StageOutcome, WorkArrangement } from './types'

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const OUTCOME_LABEL: Record<StageOutcome, string> = {
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
}

export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = {
  on_site: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
}

/** Why Compare is disabled (AC-06.6); also the message when a run hits the same 409. */
export const BLOCKED_REASON_TEXT: Record<BlockedReason, string> = {
  no_resume: 'Add your resume in Settings first.',
  no_job_description: 'Paste the job description first.',
}

/** The phrase in each reason that links to where it's fixed (Settings, the edit page). */
export const BLOCKED_REASON_LINK: Record<BlockedReason, string> = {
  no_resume: 'Settings',
  no_job_description: 'job description',
}

// The backend already stores "Skipped: …" and "Failed: …" details; strip that
// prefix before adding ours so it never reads "Skipped: Skipped: …".
function reason(detail: string | null, prefix: string): string | null {
  if (!detail) return null
  const trimmed = detail.trim()
  const stripped = trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}:`)
    ? trimmed.slice(prefix.length + 1).trim()
    : trimmed
  return stripped || null
}

// "First check pending." is the PRD's never-run text for the daily check (F-04);
// the weekly digest has its own, since it isn't a check.
const NEVER_RUN: Record<JobType, string> = {
  quiet_check: 'First check pending.',
  digest: 'No digest run yet.',
}

export function jobRunText(run: JobRunResponse | null, job: JobType): string {
  if (!run) return NEVER_RUN[job]
  switch (run.status) {
    case 'succeeded':
      return 'Succeeded'
    case 'skipped': {
      const why = reason(run.detail, 'Skipped')
      return why ? `Skipped: ${why}` : 'Skipped'
    }
    case 'not_sent':
      return 'Not sent: daily email limit reached'
    case 'failed':
      return `Failed: ${reason(run.detail, 'Failed') ?? 'unknown error'}`
  }
}
