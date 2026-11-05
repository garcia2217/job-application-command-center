import { describe, expect, test } from 'bun:test'
import {
  ARRANGEMENT_LABEL,
  BLOCKED_REASON_LINK,
  BLOCKED_REASON_TEXT,
  OUTCOME_LABEL,
  STATUS_LABEL,
  jobRunText,
} from '@/lib/labels'
import { APPLICATION_STATUSES, STAGE_OUTCOMES, WORK_ARRANGEMENTS, type JobRunResponse } from '@/lib/types'

function run(status: JobRunResponse['status'], detail: string | null): JobRunResponse {
  return { id: 1, job_type: 'digest', account_id: 1, ran_at: '2026-11-05T08:00:00Z', status, detail }
}

describe('enum labels', () => {
  test('every status has its display word', () => {
    expect(APPLICATION_STATUSES.map((s) => STATUS_LABEL[s])).toEqual([
      'Wishlist',
      'Applied',
      'Interviewing',
      'Offer',
      'Rejected',
      'Withdrawn',
    ])
  })

  test('every outcome has its display word', () => {
    expect(STAGE_OUTCOMES.map((o) => OUTCOME_LABEL[o])).toEqual(['Pending', 'Passed', 'Failed'])
  })

  test('every work arrangement has its display word', () => {
    expect(WORK_ARRANGEMENTS.map((w) => ARRANGEMENT_LABEL[w])).toEqual(['On-site', 'Hybrid', 'Remote'])
  })
})

// Fixture details are the backend's stored strings (digest_service.py, quiet_check_service.py).
describe('jobRunText', () => {
  test('a daily check that never ran → first check pending (F-04)', () => {
    expect(jobRunText(null, 'quiet_check')).toBe('First check pending.')
  })

  test('a digest that never ran has its own text', () => {
    expect(jobRunText(null, 'digest')).toBe('No digest run yet.')
  })

  test('succeeded ignores detail', () => {
    expect(jobRunText(run('succeeded', 'Flagged 3 application(s)'), 'digest')).toBe('Succeeded')
    expect(jobRunText(run('succeeded', 'Sent to owner@example.com'), 'digest')).toBe('Succeeded')
  })

  test('skipped with the stored "Skipped: …" detail does not repeat the prefix', () => {
    expect(jobRunText(run('skipped', 'Skipped: nothing to report'), 'digest')).toBe('Skipped: nothing to report')
    expect(jobRunText(run('skipped', 'Skipped: demo account'), 'digest')).toBe('Skipped: demo account')
  })

  test('skipped with a bare reason gets the prefix', () => {
    expect(jobRunText(run('skipped', 'nothing to report'), 'digest')).toBe('Skipped: nothing to report')
  })

  test('skipped with no detail', () => {
    expect(jobRunText(run('skipped', null), 'digest')).toBe('Skipped')
  })

  test('not_sent', () => {
    expect(jobRunText(run('not_sent', 'Not sent: daily email limit reached'), 'digest')).toBe(
      'Not sent: daily email limit reached',
    )
    expect(jobRunText(run('not_sent', null), 'digest')).toBe('Not sent: daily email limit reached')
  })

  test('failed with the stored "Failed: …" detail does not repeat the prefix', () => {
    expect(jobRunText(run('failed', 'Failed: OperationalError'), 'digest')).toBe('Failed: OperationalError')
  })

  test('failed with a bare reason gets the prefix', () => {
    expect(jobRunText(run('failed', 'timeout'), 'digest')).toBe('Failed: timeout')
  })

  test('failed with no detail', () => {
    expect(jobRunText(run('failed', null), 'digest')).toBe('Failed: unknown error')
  })
})

describe('BLOCKED_REASON_TEXT', () => {
  test('the PRD reasons (AC-06.6)', () => {
    expect(BLOCKED_REASON_TEXT).toEqual({
      no_resume: 'Add your resume in Settings first.',
      no_job_description: 'Paste the job description first.',
    })
  })

  test('each linked phrase appears exactly once in its reason', () => {
    for (const reason of ['no_resume', 'no_job_description'] as const) {
      const parts = BLOCKED_REASON_TEXT[reason].split(BLOCKED_REASON_LINK[reason])
      expect(parts).toHaveLength(2)
    }
  })

  test('the settings reason links the word Settings', () => {
    expect(BLOCKED_REASON_LINK.no_resume).toBe('Settings')
  })
})
