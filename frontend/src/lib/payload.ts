// Pure form-values → API payload mappers, used by the Server Actions before zod.
// Create: a blank optional field is omitted. Update: a blank optional field is
// null (clears it), and every field the form holds is sent. Required fields are
// never null (the backend rejects null for them); a blank one is sent as '' so
// validation reports it. Integers parse only from plain digits; anything else
// stays a raw string for zod to reject.
export type FormInput = Record<string, string | undefined>
export type Mode = 'create' | 'update'
export type Payload = Record<string, unknown>

type Parse = (value: string) => unknown

const asText: Parse = (v) => v
const asInt: Parse = (v) => (/^\d+$/.test(v) ? Number(v) : v)

function optional(out: Payload, form: FormInput, key: string, mode: Mode, parse: Parse = asText) {
  const raw = form[key]
  if (raw === undefined) return
  const value = raw.trim()
  if (value) out[key] = parse(value)
  else if (mode === 'update') out[key] = null
}

function required(out: Payload, form: FormInput, key: string, mode: Mode, parse: Parse = asText) {
  const raw = form[key]
  if (raw === undefined && mode === 'update') return
  const value = (raw ?? '').trim()
  out[key] = value ? parse(value) : ''
}

const APPLICATION_TEXT = ['posting_url', 'location', 'salary_currency', 'source', 'date_applied', 'notes', 'job_description']

export function applicationPayload(form: FormInput, mode: Mode): Payload {
  const out: Payload = {}
  if (mode === 'create') {
    if (form.company_id === '__new__') out.company = { name: (form['company.name'] ?? '').trim() }
    else optional(out, form, 'company_id', 'create', asInt)
  } else {
    required(out, form, 'company_id', mode, asInt)
  }
  required(out, form, 'role_title', mode)
  required(out, form, 'status', mode)
  for (const key of APPLICATION_TEXT) optional(out, form, key, mode)
  optional(out, form, 'work_arrangement', mode)
  optional(out, form, 'salary_min', mode, asInt)
  optional(out, form, 'salary_max', mode, asInt)
  if (mode === 'create') out.confirm_duplicate = form.confirm_duplicate === 'true'
  return out
}

export function stagePayload(form: FormInput, mode: Mode): Payload {
  const out: Payload = {}
  required(out, form, 'name', mode)
  // naive datetime-local value; the backend reads it in the account's zone
  optional(out, form, 'scheduled_at', mode)
  // create: blank → omitted so the backend default (Pending) applies
  if (mode === 'create') optional(out, form, 'outcome', mode)
  else required(out, form, 'outcome', mode)
  optional(out, form, 'notes', mode)
  return out
}

export function companyPayload(form: FormInput, mode: Mode): Payload {
  const out: Payload = {}
  required(out, form, 'name', mode)
  optional(out, form, 'website', mode)
  optional(out, form, 'notes', mode)
  return out
}

export function contactPayload(form: FormInput, mode: Mode): Payload {
  const out: Payload = {}
  if (mode === 'create') required(out, form, 'company_id', mode, asInt)
  required(out, form, 'name', mode)
  for (const key of ['title', 'email', 'linkedin_url', 'notes']) optional(out, form, key, mode)
  return out
}

/** PATCH /settings: only the fields the form holds; never null for any of them. */
export function settingsPayload(form: FormInput): Payload {
  const out: Payload = {}
  required(out, form, 'quiet_threshold_days', 'update', asInt)
  required(out, form, 'timezone', 'update')
  // sent as-is: an empty string clears the resume; null would be rejected
  if (form.resume_tex !== undefined) out.resume_tex = form.resume_tex
  return out
}
