import { describe, expect, test } from 'bun:test'
import * as z from 'zod'
import {
  applicationSchema,
  companySchema,
  contactSchema,
  settingsSchema,
  signInSchema,
  stageSchema,
} from '@/lib/validation'

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string[] | undefined> {
  const result = schema.safeParse(input)
  return result.success ? {} : (z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>)
}

describe('signInSchema', () => {
  test('blank email and password', () => {
    expect(errorsOf(signInSchema, { email: '   ', password: '' })).toEqual({
      email: ['Enter your email.'],
      password: ['Enter your password.'],
    })
  })

  test('trims the email', () => {
    expect(signInSchema.parse({ email: ' a@b.c ', password: 'x' }).email).toBe('a@b.c')
  })
})

describe('applicationSchema', () => {
  const create = { company_id: 3, role_title: 'Engineer', status: 'applied', confirm_duplicate: false }

  test('a minimal create passes', () => {
    expect(applicationSchema('create').safeParse(create).success).toBe(true)
  })

  test('role title is required', () => {
    expect(errorsOf(applicationSchema('create'), { ...create, role_title: '' }).role_title).toEqual([
      'Role title is required.',
    ])
  })

  test('create needs a company', () => {
    const { company_id: _omit, ...rest } = create
    void _omit
    expect(errorsOf(applicationSchema('create'), rest).company_id).toEqual(['Choose or create a company.'])
  })

  test('a non-numeric company_id is rejected', () => {
    expect(errorsOf(applicationSchema('create'), { ...create, company_id: 'abc' }).company_id).toEqual([
      'Choose or create a company.',
    ])
  })

  test('a new company needs a name, keyed company.name', () => {
    const { company_id: _omit, ...rest } = create
    void _omit
    expect(errorsOf(applicationSchema('create'), { ...rest, company: { name: '' } })).toEqual({
      'company.name': ['Company name is required.'],
    })
    expect(applicationSchema('create').safeParse({ ...rest, company: { name: 'Acme' } }).success).toBe(true)
  })

  test('posting url must be http(s)', () => {
    expect(errorsOf(applicationSchema('create'), { ...create, posting_url: 'ftp://x' }).posting_url).toEqual([
      'Enter a valid http(s) URL.',
    ])
    expect(applicationSchema('create').safeParse({ ...create, posting_url: 'https://x.io/j' }).success).toBe(true)
  })

  test.each(['1e3', -1, 1.5])('salary %p is not a whole number', (value) => {
    expect(
      errorsOf(applicationSchema('create'), { ...create, salary_min: value, salary_currency: 'EUR' }).salary_min,
    ).toEqual(['Enter a whole number.'])
  })

  test('min above max is reported on salary_max', () => {
    expect(
      errorsOf(applicationSchema('create'), { ...create, salary_min: 200, salary_max: 100, salary_currency: 'EUR' }),
    ).toEqual({ salary_max: ["Minimum salary can't be higher than the maximum."] })
  })

  test('a salary needs a currency', () => {
    expect(errorsOf(applicationSchema('create'), { ...create, salary_max: 100 })).toEqual({
      salary_currency: ['Add a currency code for the salary.'],
    })
    expect(errorsOf(applicationSchema('update'), { salary_min: 100, salary_currency: null })).toEqual({
      salary_currency: ['Add a currency code for the salary.'],
    })
  })

  test('status must be one of the six', () => {
    expect(errorsOf(applicationSchema('create'), { ...create, status: 'ghosted' }).status).toHaveLength(1)
  })

  test('update accepts nulls for optional fields', () => {
    expect(
      applicationSchema('update').safeParse({
        company_id: 3,
        role_title: 'Engineer',
        status: 'offer',
        posting_url: null,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        work_arrangement: null,
      }).success,
    ).toBe(true)
  })

  test('update rejects a blank company_id', () => {
    expect(errorsOf(applicationSchema('update'), { company_id: '' }).company_id).toEqual([
      'Choose or create a company.',
    ])
  })
})

describe('companySchema', () => {
  test('name required, website http(s)', () => {
    expect(errorsOf(companySchema, { name: '', website: 'example.com' })).toEqual({
      name: ['Company name is required.'],
      website: ['Enter a valid http(s) URL.'],
    })
    expect(companySchema.safeParse({ name: 'Acme', website: null }).success).toBe(true)
  })
})

describe('contactSchema', () => {
  test('name, email and LinkedIn rules', () => {
    expect(errorsOf(contactSchema, { company_id: 1, name: '', email: 'nope', linkedin_url: 'linkedin.com/in/x' })).toEqual({
      name: ['Name is required.'],
      email: ['Enter a valid email address.'],
      linkedin_url: ['Enter a valid URL.'],
    })
    expect(
      contactSchema.safeParse({ company_id: 1, name: 'Ada', email: 'ada@example.com', linkedin_url: 'https://linkedin.com/in/ada' })
        .success,
    ).toBe(true)
  })
})

describe('stageSchema', () => {
  test('name required', () => {
    expect(errorsOf(stageSchema, { name: '' })).toEqual({ name: ['Stage name is required.'] })
    expect(stageSchema.safeParse({ name: 'Onsite', scheduled_at: '2026-11-10T14:00' }).success).toBe(true)
  })
})

describe('settingsSchema', () => {
  test.each([0, 91, 7.5, '7x'])('threshold %p is out of range', (value) => {
    expect(errorsOf(settingsSchema, { quiet_threshold_days: value }).quiet_threshold_days).toEqual([
      'Enter a whole number from 1 to 90.',
    ])
  })

  test.each([1, 90])('threshold %p is fine', (value) => {
    expect(settingsSchema.safeParse({ quiet_threshold_days: value }).success).toBe(true)
  })

  test('resume limit counts code points', () => {
    expect(settingsSchema.safeParse({ resume_tex: '😀'.repeat(50_000) }).success).toBe(true)
    expect(errorsOf(settingsSchema, { resume_tex: 'a'.repeat(50_001) }).resume_tex).toEqual([
      'Resume must be 50,000 characters or fewer',
    ])
  })

  test('an empty resume is allowed (clears it)', () => {
    expect(settingsSchema.safeParse({ resume_tex: '' }).success).toBe(true)
  })
})
