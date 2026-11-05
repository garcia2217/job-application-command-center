import { NextResponse, type NextRequest } from 'next/server'

const SESSION_COOKIE = 'session' // same literal as src/lib/session.ts (server-only, not importable here)
const PUBLIC_PATHS = new Set(['/sign-in', '/session-expired'])

// Optimistic redirect on cookie presence only; the backend's 401 is the real gate.
export default async function proxy(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE)
  const { pathname } = req.nextUrl
  if (!hasSession && !PUBLIC_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl))
  }
  if (hasSession && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
