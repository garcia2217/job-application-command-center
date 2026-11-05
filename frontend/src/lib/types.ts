// Hand-written from the backend's /openapi.json (docs/API_CONTRACT.md "Frontend types").
// Field names are snake_case as the backend emits them; datetimes and dates are ISO strings.

export const APPLICATION_STATUSES = [
  'wishlist',
  'applied',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const STAGE_OUTCOMES = ['pending', 'passed', 'failed'] as const
export type StageOutcome = (typeof STAGE_OUTCOMES)[number]

export const WORK_ARRANGEMENTS = ['on_site', 'hybrid', 'remote'] as const
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number]

export const JOB_STATUSES = ['succeeded', 'skipped', 'not_sent', 'failed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export type JobType = 'quiet_check' | 'digest'

export type BlockedReason = 'no_resume' | 'no_job_description'

// ---------- Auth and account ----------

export type LoginRequest = {
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  expires_at: string
}

export type AccountResponse = {
  id: number
  email: string
  is_demo: boolean
  quiet_threshold_days: number
  timezone: string
  has_resume: boolean
}

export type SettingsResponse = {
  id: number
  email: string
  is_demo: boolean
  quiet_threshold_days: number
  timezone: string
  resume_tex: string | null
  resume_updated_at: string | null
  has_resume: boolean
}

export type SettingsUpdate = {
  quiet_threshold_days?: number | null
  timezone?: string | null
  resume_tex?: string | null
}

// ---------- Companies ----------

export type CompanyRef = {
  id: number
  name: string
}

export type CompanyResponse = {
  id: number
  name: string
  website: string | null
  notes: string | null
  created_at: string
}

export type CompanyDetailResponse = CompanyResponse & {
  applications: ApplicationSummary[]
  contacts: ContactResponse[]
}

export type CompanyCreate = {
  name: string
  website?: string | null
  notes?: string | null
}

export type CompanyUpdate = {
  name?: string | null
  website?: string | null
  notes?: string | null
}

// ---------- Contacts ----------

export type ContactResponse = {
  id: number
  company_id: number
  name: string
  title: string | null
  email: string | null
  linkedin_url: string | null
  notes: string | null
  created_at: string
}

export type ContactListItem = ContactResponse & {
  company_name: string
}

export type ContactCreate = {
  company_id: number
  name: string
  title?: string | null
  email?: string | null
  linkedin_url?: string | null
  notes?: string | null
}

export type ContactUpdate = {
  name?: string | null
  title?: string | null
  email?: string | null
  linkedin_url?: string | null
  notes?: string | null
}

// ---------- Stages ----------

export type StageResponse = {
  id: number
  application_id: number
  name: string
  scheduled_at: string | null
  outcome: StageOutcome
  notes: string | null
  position: number
  created_at: string
}

export type StageCreate = {
  name: string
  scheduled_at?: string | null
  outcome?: StageOutcome
  notes?: string | null
}

export type StageUpdate = {
  name?: string | null
  scheduled_at?: string | null
  outcome?: StageOutcome | null
  notes?: string | null
}

export type StageMove = {
  direction: 'up' | 'down'
}

export type UpcomingStageSummary = {
  application_id: number
  company: string
  role_title: string
  stage_name: string
  scheduled_at: string
}

// ---------- Applications ----------

export type ApplicationSummary = {
  id: number
  company: CompanyRef
  role_title: string
  status: ApplicationStatus
  date_applied: string | null
  last_activity_at: string
  is_quiet: boolean
  days_since_activity: number
}

export type ApplicationDetailResponse = ApplicationSummary & {
  posting_url: string | null
  location: string | null
  work_arrangement: WorkArrangement | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  source: string | null
  notes: string | null
  job_description: string | null
  created_at: string
  stages: StageResponse[]
  contacts: ContactResponse[]
}

export type ApplicationCreate = {
  role_title: string
  company_id?: number | null
  company?: CompanyCreate | null
  status?: ApplicationStatus
  confirm_duplicate?: boolean
  posting_url?: string | null
  location?: string | null
  work_arrangement?: WorkArrangement | null
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string | null
  source?: string | null
  date_applied?: string | null
  notes?: string | null
  job_description?: string | null
}

export type ApplicationUpdate = {
  role_title?: string | null
  company_id?: number | null
  status?: ApplicationStatus | null
  posting_url?: string | null
  location?: string | null
  work_arrangement?: WorkArrangement | null
  salary_min?: number | null
  salary_max?: number | null
  salary_currency?: string | null
  source?: string | null
  date_applied?: string | null
  notes?: string | null
  job_description?: string | null
}

// ---------- Comparison ----------

export type ComparisonResponse = {
  matched: string[]
  missing: string[]
  requirement_count: number
  match_percentage: number | null
  ran_at: string
  is_stale: boolean
}

export type ComparisonStateResponse = {
  blocked_reason: BlockedReason | null
  comparison: ComparisonResponse | null
}

// ---------- Jobs and digest ----------

export type JobRunResponse = {
  id: number
  job_type: JobType
  account_id: number | null
  ran_at: string
  status: JobStatus
  detail: string | null
}

export type JobRunsResponse = {
  quiet_check: JobRunResponse | null
  digest: JobRunResponse | null
}

export type QuietItemResponse = {
  application_id: number
  company: string
  role_title: string
  status: ApplicationStatus
  days_since_activity: number
  url: string
}

export type UpcomingStageResponse = {
  application_id: number
  company: string
  role_title: string
  stage_name: string
  scheduled_at: string
  url: string
}

export type DigestPreviewResponse = {
  would_send: boolean
  skip_reason: string | null
  window_start: string
  window_end: string
  quiet: QuietItemResponse[]
  upcoming: UpcomingStageResponse[]
}

// ---------- Errors ----------

export type ProblemFieldError = {
  location: string
  field: string | null
  message: string
  type: string
}

export type ProblemResponse = {
  type: string
  title: string
  status: number
  detail: string
  code: string
  errors?: ProblemFieldError[] | null
  existing_id?: number
}
