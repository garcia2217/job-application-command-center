import 'server-only'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { parseProblem, type FieldErrors } from './problem'
import { SESSION_COOKIE } from './session'
import type {
  AccountResponse,
  ApplicationCreate,
  ApplicationDetailResponse,
  ApplicationStatus,
  ApplicationSummary,
  ApplicationUpdate,
  CompanyCreate,
  CompanyDetailResponse,
  CompanyResponse,
  CompanyUpdate,
  ComparisonStateResponse,
  ContactCreate,
  ContactListItem,
  ContactResponse,
  ContactUpdate,
  DigestPreviewResponse,
  JobRunsResponse,
  LoginRequest,
  LoginResponse,
  SettingsResponse,
  SettingsUpdate,
  StageCreate,
  StageResponse,
  StageUpdate,
  UpcomingStageSummary,
} from './types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: FieldErrors,
    readonly existingId?: number,
  ) {
    super(message)
  }
}

type RequestOptions = RequestInit & {
  // logout must not bounce through /session-expired; it clears the cookie itself
  redirectOnUnauthenticated?: boolean
}

function baseUrl(): string {
  const url = process.env.API_BASE_URL
  if (!url) throw new Error('API_BASE_URL is not set')
  return url.replace(/\/$/, '')
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { redirectOnUnauthenticated = true, headers, ...init } = options
  const session = (await cookies()).get(SESSION_COOKIE)?.value
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(session ? { cookie: `${SESSION_COOKIE}=${session}` } : {}),
      ...headers,
    },
    cache: 'no-store', // every response is private to one account
  })
  if (!res.ok) {
    const problem = parseProblem(res.status, await res.json().catch(() => null))
    if (res.status === 401 && problem.code === 'UNAUTHENTICATED' && redirectOnUnauthenticated) {
      redirect('/session-expired')
    }
    throw new ApiError(problem.status, problem.code, problem.detail, problem.fieldErrors, problem.existingId)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const json = (body: unknown) => JSON.stringify(body)
const query = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export type ListParams = {
  status?: ApplicationStatus
  quiet?: boolean
  sort?: 'last_activity' | 'date_applied'
  order?: 'asc' | 'desc'
}

export const api = {
  auth: {
    login: (body: LoginRequest) => request<LoginResponse>('/auth/login', { method: 'POST', body: json(body) }),
    logout: () => request<void>('/auth/logout', { method: 'POST', redirectOnUnauthenticated: false }),
    me: cache(() => request<AccountResponse>('/auth/me')),
  },
  settings: {
    get: () => request<SettingsResponse>('/settings'),
    update: (body: SettingsUpdate) => request<SettingsResponse>('/settings', { method: 'PATCH', body: json(body) }),
    jobRuns: cache(() => request<JobRunsResponse>('/settings/job-runs')),
    digestPreview: () => request<DigestPreviewResponse>('/settings/digest-preview'),
  },
  applications: {
    list: (p: ListParams = {}) =>
      request<ApplicationSummary[]>(
        `/applications${query({
          status: p.status,
          quiet: p.quiet === undefined ? undefined : String(p.quiet),
          sort: p.sort,
          order: p.order,
        })}`,
      ),
    quiet: cache(() => request<ApplicationSummary[]>('/applications?quiet=true')),
    get: cache((id: number) => request<ApplicationDetailResponse>(`/applications/${id}`)),
    create: (body: ApplicationCreate) =>
      request<ApplicationDetailResponse>('/applications', { method: 'POST', body: json(body) }),
    update: (id: number, body: ApplicationUpdate) =>
      request<ApplicationDetailResponse>(`/applications/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: number) => request<void>(`/applications/${id}`, { method: 'DELETE' }),
  },
  comparisons: {
    get: (id: number) => request<ComparisonStateResponse>(`/applications/${id}/comparison`),
    run: (id: number) => request<ComparisonStateResponse>(`/applications/${id}/comparison`, { method: 'POST' }),
  },
  stages: {
    upcoming: cache(() => request<UpcomingStageSummary[]>('/stages/upcoming')),
    create: (appId: number, body: StageCreate) =>
      request<StageResponse>(`/applications/${appId}/stages`, { method: 'POST', body: json(body) }),
    update: (appId: number, id: number, body: StageUpdate) =>
      request<StageResponse>(`/applications/${appId}/stages/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (appId: number, id: number) =>
      request<void>(`/applications/${appId}/stages/${id}`, { method: 'DELETE' }),
    move: (appId: number, id: number, direction: 'up' | 'down') =>
      // returns the application's stages in their new order
      request<StageResponse[]>(`/applications/${appId}/stages/${id}/move`, {
        method: 'POST',
        body: json({ direction }),
      }),
  },
  companies: {
    list: cache(() => request<CompanyResponse[]>('/companies')),
    get: cache((id: number) => request<CompanyDetailResponse>(`/companies/${id}`)),
    create: (body: CompanyCreate) => request<CompanyResponse>('/companies', { method: 'POST', body: json(body) }),
    update: (id: number, body: CompanyUpdate) =>
      request<CompanyResponse>(`/companies/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: number) => request<void>(`/companies/${id}`, { method: 'DELETE' }),
  },
  contacts: {
    list: () => request<ContactListItem[]>('/contacts'),
    get: (id: number) => request<ContactResponse>(`/contacts/${id}`),
    create: (body: ContactCreate) => request<ContactResponse>('/contacts', { method: 'POST', body: json(body) }),
    update: (id: number, body: ContactUpdate) =>
      request<ContactResponse>(`/contacts/${id}`, { method: 'PATCH', body: json(body) }),
    remove: (id: number) => request<void>(`/contacts/${id}`, { method: 'DELETE' }),
    link: (appId: number, id: number) =>
      request<void>(`/applications/${appId}/contacts/${id}`, { method: 'PUT' }),
    unlink: (appId: number, id: number) =>
      request<void>(`/applications/${appId}/contacts/${id}`, { method: 'DELETE' }),
  },
}

/** Route param → positive integer id, or notFound() for anything else. */
export function parseId(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw)) notFound()
  const id = Number(raw)
  if (!Number.isSafeInteger(id)) notFound()
  return id
}
