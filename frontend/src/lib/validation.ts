// The fast first pass over payload.ts output; the backend stays the authority.
// Messages are PRD copy; error keys are the backend's snake_case field names.
import * as z from 'zod'
import type { Mode } from './payload'
import { isOverResumeLimit } from './settings'
import { APPLICATION_STATUSES, STAGE_OUTCOMES, WORK_ARRANGEMENTS } from './types'

const httpUrl = (error: string) => z.url({ protocol: /^https?$/, error })
const optionalText = z.string().nullish()
const wholeNumber = (error: string) =>
  z.number({ error }).int({ error }).nonnegative({ error }).nullish()

export const signInSchema = z.object({
  email: z.string().trim().min(1, { error: 'Enter your email.' }),
  password: z.string().min(1, { error: 'Enter your password.' }),
})

const CHOOSE_COMPANY = 'Choose or create a company.'

const applicationFields = {
  role_title: z.string().trim().min(1, { error: 'Role title is required.' }),
  status: z.enum(APPLICATION_STATUSES, { error: 'Choose a status.' }),
  posting_url: httpUrl('Enter a valid http(s) URL.').nullish(),
  location: optionalText,
  work_arrangement: z.enum(WORK_ARRANGEMENTS, { error: 'Choose a work arrangement.' }).nullish(),
  salary_min: wholeNumber('Enter a whole number.'),
  salary_max: wholeNumber('Enter a whole number.'),
  salary_currency: optionalText,
  source: optionalText,
  date_applied: optionalText,
  notes: optionalText,
  job_description: optionalText,
}

type SalaryFields = {
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string | null
}

function checkSalary(data: SalaryFields, ctx: z.RefinementCtx) {
  const { salary_min: min, salary_max: max, salary_currency: currency } = data
  if (min != null && max != null && min > max) {
    // AC-02.3: the backend reports this on salary_max too
    ctx.addIssue({ code: 'custom', message: "Minimum salary can't be higher than the maximum.", path: ['salary_max'] })
  }
  if ((min != null || max != null) && !currency) {
    ctx.addIssue({ code: 'custom', message: 'Add a currency code for the salary.', path: ['salary_currency'] })
  }
}

const applicationCreateSchema = z
  .object({
    ...applicationFields,
    company_id: z.number({ error: CHOOSE_COMPANY }).int({ error: CHOOSE_COMPANY }).positive({ error: CHOOSE_COMPANY }).optional(),
    company: z.object({ name: z.string() }).optional(),
    confirm_duplicate: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.company) {
      // the backend joins nested fields with '.', so the form field is named company.name
      if (!data.company.name.trim()) {
        ctx.addIssue({ code: 'custom', message: 'Company name is required.', path: ['company.name'] })
      }
    } else if (data.company_id === undefined) {
      ctx.addIssue({ code: 'custom', message: CHOOSE_COMPANY, path: ['company_id'] })
    }
    checkSalary(data, ctx)
  })

const applicationUpdateSchema = z
  .object({
    ...applicationFields,
    role_title: applicationFields.role_title.optional(),
    status: applicationFields.status.optional(),
    company_id: z.number({ error: CHOOSE_COMPANY }).int({ error: CHOOSE_COMPANY }).positive({ error: CHOOSE_COMPANY }).optional(),
  })
  .superRefine(checkSalary)

export function applicationSchema(mode: 'create'): typeof applicationCreateSchema
export function applicationSchema(mode: 'update'): typeof applicationUpdateSchema
export function applicationSchema(mode: Mode): typeof applicationCreateSchema | typeof applicationUpdateSchema
export function applicationSchema(mode: Mode) {
  return mode === 'create' ? applicationCreateSchema : applicationUpdateSchema
}

export const companySchema = z.object({
  name: z.string().trim().min(1, { error: 'Company name is required.' }).optional(),
  website: httpUrl('Enter a valid http(s) URL.').nullish(),
  notes: optionalText,
})

export const contactSchema = z.object({
  // create only; contactPayload never sends it on update
  company_id: z.number({ error: 'Choose a company.' }).int({ error: 'Choose a company.' }).positive({ error: 'Choose a company.' }).optional(),
  name: z.string().trim().min(1, { error: 'Name is required.' }).optional(),
  title: optionalText,
  email: z.email({ error: 'Enter a valid email address.' }).nullish(),
  linkedin_url: httpUrl('Enter a valid URL.').nullish(),
  notes: optionalText,
})

export const stageSchema = z.object({
  name: z.string().trim().min(1, { error: 'Stage name is required.' }).optional(),
  scheduled_at: optionalText,
  outcome: z.enum(STAGE_OUTCOMES, { error: 'Choose an outcome.' }).optional(),
  notes: optionalText,
})

const THRESHOLD = 'Enter a whole number from 1 to 90.'

export const settingsSchema = z.object({
  quiet_threshold_days: z
    .number({ error: THRESHOLD })
    .int({ error: THRESHOLD })
    .min(1, { error: THRESHOLD })
    .max(90, { error: THRESHOLD })
    .optional(),
  timezone: z.string().optional(),
  resume_tex: z
    .string()
    .refine((text) => !isOverResumeLimit(text), { error: 'Resume must be 50,000 characters or fewer' })
    .optional(),
})
