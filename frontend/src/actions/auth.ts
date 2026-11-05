'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import * as z from 'zod'
import { api, ApiError } from '@/lib/api'
import { requireSession, SESSION_COOKIE } from '@/lib/session'
import type { LoginResponse } from '@/lib/types'
import { signInSchema } from '@/lib/validation'
import type { FormState } from './form-state'

const INCORRECT = 'Email or password is incorrect.'
const LOCKED = 'Too many attempts. Try again in 15 minutes.'
const UNAVAILABLE = 'Sign-in is unavailable right now. Try again.'

// The one public action: no requireSession(), since there is no session yet.
export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { email: formData.get('email'), password: formData.get('password') }
  const email = typeof raw.email === 'string' ? raw.email : ''
  const values = { email } // the password is never sent back
  const parsed = signInSchema.safeParse({ email, password: typeof raw.password === 'string' ? raw.password : '' })
  if (!parsed.success) {
    // F-01: empty fields make no API call, so no attempt is counted
    return { errors: z.flattenError(parsed.error).fieldErrors, values }
  }

  let session: LoginResponse
  try {
    session = await api.auth.login(parsed.data)
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    if (error.code === 'ACCOUNT_LOCKED') return { message: LOCKED, values }
    // AC-01.2: one generic message; a malformed email (VALIDATION_FAILED) must not reveal which field was wrong
    if (error.code === 'INVALID_CREDENTIALS' || error.code === 'VALIDATION_FAILED') {
      return { message: INCORRECT, values }
    }
    return { message: UNAVAILABLE, values }
  }

  ;(await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(session.expires_at), // the backend's 7-day expiry, so cookie and session agree
  })
  redirect('/')
}

export async function signOut(): Promise<void> {
  await requireSession()
  try {
    await api.auth.logout()
  } catch (error) {
    // best effort: the cookie clears regardless of what the backend says
    if (!(error instanceof ApiError)) throw error
  }
  ;(await cookies()).delete(SESSION_COOKIE)
  redirect('/sign-in')
}
