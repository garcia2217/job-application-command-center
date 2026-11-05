import { describe, expect, test } from 'bun:test'
import {
  applicationPayload,
  companyPayload,
  contactPayload,
  settingsPayload,
  stagePayload,
} from '@/lib/payload'

describe('applicationPayload create', () => {
  const base = { company_id: '3', role_title: '  Backend Engineer ', status: 'applied' }

  test('trims strings and parses company_id', () => {
    expect(applicationPayload(base, 'create')).toEqual({
      company_id: 3,
      role_title: 'Backend Engineer',
      status: 'applied',
      confirm_duplicate: false,
    })
  })

  test('blank optional fields are omitted', () => {
    const p = applicationPayload(
      { ...base, posting_url: '  ', location: '', work_arrangement: '', salary_min: '', notes: '' },
      'create',
    )
    expect(p).not.toHaveProperty('posting_url')
    expect(p).not.toHaveProperty('location')
    expect(p).not.toHaveProperty('work_arrangement')
    expect(p).not.toHaveProperty('salary_min')
    expect(p).not.toHaveProperty('notes')
  })

  test('filled optional fields are sent', () => {
    const p = applicationPayload(
      {
        ...base,
        posting_url: ' https://example.com/job ',
        work_arrangement: 'remote',
        salary_min: '100',
        salary_max: '150000',
        salary_currency: 'EUR',
        date_applied: '2026-11-01',
        job_description: 'Python',
      },
      'create',
    )
    expect(p).toMatchObject({
      posting_url: 'https://example.com/job',
      work_arrangement: 'remote',
      salary_min: 100,
      salary_max: 150000,
      salary_currency: 'EUR',
      date_applied: '2026-11-01',
      job_description: 'Python',
    })
  })

  test('non-integer numbers are kept as raw strings for zod to report', () => {
    const p = applicationPayload({ ...base, salary_min: '1e3', salary_max: '-5' }, 'create')
    expect(p.salary_min).toBe('1e3')
    expect(p.salary_max).toBe('-5')
  })

  test('__new__ company sends the nested name instead of company_id', () => {
    const p = applicationPayload({ ...base, company_id: '__new__', 'company.name': '  Acme ' }, 'create')
    expect(p.company).toEqual({ name: 'Acme' })
    expect(p).not.toHaveProperty('company_id')
  })

  test('blank company_id is omitted', () => {
    const p = applicationPayload({ ...base, company_id: '' }, 'create')
    expect(p).not.toHaveProperty('company_id')
    expect(p).not.toHaveProperty('company')
  })

  test('confirm_duplicate is true only for the literal "true"', () => {
    expect(applicationPayload({ ...base, confirm_duplicate: 'true' }, 'create').confirm_duplicate).toBe(true)
    expect(applicationPayload({ ...base, confirm_duplicate: 'yes' }, 'create').confirm_duplicate).toBe(false)
  })

  test('missing required fields are sent blank so validation reports them', () => {
    const p = applicationPayload({ company_id: '3' }, 'create')
    expect(p.role_title).toBe('')
  })
})

describe('applicationPayload update', () => {
  const base = { company_id: '3', role_title: 'Backend Engineer', status: 'offer' }

  test('blank optional fields become null; required stay values', () => {
    const p = applicationPayload(
      { ...base, posting_url: '', work_arrangement: '', salary_min: '', notes: ' ' },
      'update',
    )
    expect(p).toEqual({
      company_id: 3,
      role_title: 'Backend Engineer',
      status: 'offer',
      posting_url: null,
      work_arrangement: null,
      salary_min: null,
      notes: null,
    })
  })

  test('never sends company or confirm_duplicate', () => {
    const p = applicationPayload({ ...base, 'company.name': 'Acme', confirm_duplicate: 'true' }, 'update')
    expect(p).not.toHaveProperty('company')
    expect(p).not.toHaveProperty('confirm_duplicate')
    expect(p).not.toHaveProperty('company.name')
  })

  test('required fields are never null, even when blank', () => {
    const p = applicationPayload({ company_id: '', role_title: '', status: '' }, 'update')
    expect(p.role_title).toBe('')
    expect(p.status).toBe('')
    expect(p.company_id).toBe('')
  })

  test('fields the form does not hold are not sent', () => {
    expect(applicationPayload({ role_title: 'X' }, 'update')).toEqual({ role_title: 'X' })
  })
})

describe('stagePayload', () => {
  test('create: raw datetime-local string, blank outcome omitted', () => {
    expect(stagePayload({ name: ' Phone screen ', scheduled_at: '2026-11-10T14:00', outcome: '', notes: '' }, 'create')).toEqual({
      name: 'Phone screen',
      scheduled_at: '2026-11-10T14:00',
    })
  })

  test('create: blank scheduled_at omitted, chosen outcome sent', () => {
    expect(stagePayload({ name: 'Onsite', scheduled_at: '', outcome: 'passed' }, 'create')).toEqual({
      name: 'Onsite',
      outcome: 'passed',
    })
  })

  test('update: blank scheduled_at and notes become null', () => {
    expect(stagePayload({ name: 'Onsite', scheduled_at: '', outcome: 'failed', notes: '' }, 'update')).toEqual({
      name: 'Onsite',
      scheduled_at: null,
      outcome: 'failed',
      notes: null,
    })
  })

  test('update: name and outcome are never null', () => {
    const p = stagePayload({ name: '', outcome: '' }, 'update')
    expect(p.name).toBe('')
    expect(p.outcome).toBe('')
  })
})

describe('companyPayload', () => {
  test('create omits blanks', () => {
    expect(companyPayload({ name: ' Acme ', website: '', notes: '' }, 'create')).toEqual({ name: 'Acme' })
  })

  test('update nulls blanks', () => {
    expect(companyPayload({ name: 'Acme', website: '', notes: 'n' }, 'update')).toEqual({
      name: 'Acme',
      website: null,
      notes: 'n',
    })
  })
})

describe('contactPayload', () => {
  test('create sends company_id as a number', () => {
    expect(
      contactPayload({ company_id: '4', name: 'Ada', title: '', email: ' ada@example.com ', linkedin_url: '' }, 'create'),
    ).toEqual({ company_id: 4, name: 'Ada', email: 'ada@example.com' })
  })

  test('update never sends company_id and nulls blanks', () => {
    expect(contactPayload({ company_id: '4', name: 'Ada', title: '', email: '', notes: '' }, 'update')).toEqual({
      name: 'Ada',
      title: null,
      email: null,
      notes: null,
    })
  })
})

describe('settingsPayload', () => {
  test('parses the threshold and trims the zone', () => {
    expect(settingsPayload({ quiet_threshold_days: '10', timezone: ' Europe/Berlin ' })).toEqual({
      quiet_threshold_days: 10,
      timezone: 'Europe/Berlin',
    })
  })

  test('a non-integer threshold is kept raw', () => {
    expect(settingsPayload({ quiet_threshold_days: '7.5' }).quiet_threshold_days).toBe('7.5')
  })

  test('an empty resume is sent as an empty string, never null', () => {
    expect(settingsPayload({ resume_tex: '' })).toEqual({ resume_tex: '' })
  })

  test('the resume is sent as-is, untrimmed', () => {
    expect(settingsPayload({ resume_tex: '  \\section{X}\n' })).toEqual({ resume_tex: '  \\section{X}\n' })
  })
})
