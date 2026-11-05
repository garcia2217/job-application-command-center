import { describe, expect, test } from 'bun:test'
import { ARRANGEMENT_LABEL, OUTCOME_LABEL, STATUS_LABEL, jobRunText } from '@/lib/labels'
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
  test('null → first check pending', () => {
    expect(jobRunText(null)).toBe('First check pending.')
  })

  test('succeeded ignores detail', () => {
    expect(jobRunText(run('succeeded', 'Flagged 3 application(s)'))).toBe('Succeeded')
    expect(jobRunText(run('succeeded', 'Sent to owner@example.com'))).toBe('Succeeded')
  })

  test('skipped with the stored "Skipped: …" detail does not repeat the prefix', () => {
    expect(jobRunText(run('skipped', 'Skipped: nothing to report'))).toBe('Skipped: nothing to report')
    expect(jobRunText(run('skipped', 'Skipped: demo account'))).toBe('Skipped: demo account')
  })

  test('skipped with a bare reason gets the prefix', () => {
    expect(jobRunText(run('skipped', 'nothing to report'))).toBe('Skipped: nothing to report')
  })

  test('skipped with no detail', () => {
    expect(jobRunText(run('skipped', null))).toBe('Skipped')
  })

  test('not_sent', () => {
    expect(jobRunText(run('not_sent', 'Not sent: daily email limit reached'))).toBe(
      'Not sent: daily email limit reached',
    )
    expect(jobRunText(run('not_sent', null))).toBe('Not sent: daily email limit reached')
  })

  test('failed with the stored "Failed: …" detail does not repeat the prefix', () => {
    expect(jobRunText(run('failed', 'Failed: OperationalError'))).toBe('Failed: OperationalError')
  })

  test('failed with a bare reason gets the prefix', () => {
    expect(jobRunText(run('failed', 'timeout'))).toBe('Failed: timeout')
  })

  test('failed with no detail', () => {
    expect(jobRunText(run('failed', null))).toBe('Failed: unknown error')
  })
})
