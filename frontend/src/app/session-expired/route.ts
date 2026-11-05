import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session'

// api.ts sends every UNAUTHENTICATED 401 here. Clearing the stale cookie breaks the
// /sign-in → / → 401 → /sign-in loop (proxy bounces cookie holders off /sign-in).
export async function GET(req: NextRequest) {
  ;(await cookies()).delete(SESSION_COOKIE)
  return NextResponse.redirect(new URL('/sign-in', req.nextUrl))
}
