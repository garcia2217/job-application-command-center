import type { ApplicationStatus, JobRunResponse, StageOutcome, WorkArrangement } from './types'

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

export function jobRunText(run: JobRunResponse | null): string {
  if (!run) return 'First check pending.'
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
