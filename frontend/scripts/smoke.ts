// Live smoke run against a running frontend + API (not part of `bun test`).
// Uses the machine's preinstalled Playwright; it is deliberately not a dependency.
//
//   DEMO_EMAIL=… DEMO_PASSWORD=… OUT_DIR=/tmp/smoke bun scripts/smoke.ts
//
// Env: BASE_URL (default http://localhost:3000), DEMO_EMAIL, DEMO_PASSWORD, OUT_DIR (default ./smoke-out).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright'

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? ''
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? ''
const OUT_DIR = process.env.OUT_DIR ?? 'smoke-out'

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
]

let failures = 0

function check(name: string, ok: boolean, detail = ''): boolean {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  return ok
}

function pathOf(page: Page): string {
  return new URL(page.url()).pathname
}

async function sessionCookie(context: BrowserContext) {
  return (await context.cookies(BASE_URL)).find((c) => c.name === 'session')
}

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/sign-in`)
  await page.getByLabel('Email').fill(DEMO_EMAIL)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Ids of the applications linked from the list, in list order. */
async function applicationIds(page: Page): Promise<number[]> {
  await page.goto(`${BASE_URL}/applications`)
  const hrefs = await page
    .locator('a[href^="/applications/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
  const ids = hrefs.map((h) => /^\/applications\/(\d+)$/.exec(h)?.[1]).filter((id): id is string => Boolean(id))
  return [...new Set(ids)].map(Number)
}

async function firstApplicationWithComparison(page: Page): Promise<number | null> {
  for (const id of await applicationIds(page)) {
    await page.goto(`${BASE_URL}/applications/${id}`)
    // the streamed section replaces its "Loading…" fallback once the comparison resolves
    const section = page.locator('section[aria-labelledby="comparison-h"]').filter({ hasNotText: 'Loading…' })
    await section.first().waitFor()
    const text = (await section.first().textContent()) ?? ''
    if (/% match|No recognised requirements found\./.test(text)) return id
  }
  return null
}

async function firstCompanyPath(page: Page): Promise<string | null> {
  await page.goto(`${BASE_URL}/companies`)
  const hrefs = await page
    .locator('a[href^="/companies/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
  return hrefs.find((h) => /^\/companies\/\d+$/.test(h)) ?? null
}

async function checkScreen(page: Page, path: string, slug: string): Promise<void> {
  for (const viewport of VIEWPORTS) {
    const label = `${path} @${viewport.width}`
    await page.setViewportSize(viewport)
    const response = await page.goto(`${BASE_URL}${path}`)
    await page.waitForLoadState('networkidle')
    const landed = new URL(page.url())
    check(`${label} loads`, (response?.ok() ?? false) && `${landed.pathname}${landed.search}` === path, page.url())
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    check(`${label} no horizontal scroll (NFR-03)`, scrollWidth <= innerWidth, `${scrollWidth} <= ${innerWidth}`)
    const h1s = await page.locator('h1').count()
    check(`${label} exactly one h1`, h1s === 1, String(h1s))
    await page.screenshot({ path: join(OUT_DIR, `${slug}-${viewport.width}.png`), fullPage: true })
  }
}

async function main(): Promise<void> {
  if (!DEMO_EMAIL || !DEMO_PASSWORD) {
    console.error('Set DEMO_EMAIL and DEMO_PASSWORD.')
    process.exit(2)
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: VIEWPORTS[1] })
    const page = await context.newPage()

    // AC-01.2: one generic message for a wrong password
    await signIn(page, `${DEMO_PASSWORD}-wrong`)
    // scoped to the form: Next's route announcer is also role="alert"
    const alert = page.locator('form [role="alert"]')
    await alert.waitFor()
    const message = (await alert.textContent())?.trim() ?? ''
    check('wrong password shows the generic message', message === 'Email or password is incorrect.', message)
    check('wrong password stays on /sign-in', pathOf(page) === '/sign-in', page.url())

    await signIn(page, DEMO_PASSWORD)
    await page.waitForURL(`${BASE_URL}/`)
    check('demo sign-in lands on /', pathOf(page) === '/', page.url())
    check('session cookie set', Boolean(await sessionCookie(context)))

    const comparedId = await firstApplicationWithComparison(page)
    check('an application with a comparison exists', comparedId !== null, String(comparedId))
    const companyPath = await firstCompanyPath(page)
    check('a company exists', companyPath !== null, String(companyPath))

    const screens: [string, string][] = [
      ['/', 'home'],
      ['/applications', 'applications'],
      ['/applications?status=interviewing', 'applications-interviewing'],
      ...(comparedId !== null
        ? ([
            [`/applications/${comparedId}`, 'application-detail'],
            [`/applications/${comparedId}/edit`, 'application-edit'],
          ] as [string, string][])
        : []),
      ['/companies', 'companies'],
      ...(companyPath ? ([[companyPath, 'company-detail']] as [string, string][]) : []),
      ['/contacts', 'contacts'],
      ['/settings', 'settings'],
      ['/settings/digest-preview', 'digest-preview'],
    ]
    for (const [path, slug] of screens) await checkScreen(page, path, slug)

    // A stale cookie: / → 401 → /session-expired (cookie deleted) → /sign-in
    const stale = await browser.newContext({ deviceScaleFactor: 2 })
    await stale.addCookies([{ name: 'session', value: 'not-a-real-session', url: BASE_URL }])
    const stalePage = await stale.newPage()
    await stalePage.goto(`${BASE_URL}/`)
    // the 401 can surface after streaming starts, in which case Next redirects client-side
    await stalePage.waitForURL(`${BASE_URL}/sign-in`, { timeout: 10_000 }).catch(() => {})
    check('invalid cookie lands on /sign-in', pathOf(stalePage) === '/sign-in', stalePage.url())
    check('invalid cookie is cleared', !(await sessionCookie(stale)))
    await stale.close()

    await page.setViewportSize(VIEWPORTS[1])
    await page.goto(`${BASE_URL}/`)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL(`${BASE_URL}/sign-in`)
    check('sign out lands on /sign-in', pathOf(page) === '/sign-in', page.url())
    check('session cookie removed on sign out', !(await sessionCookie(context)))
    await page.goto(`${BASE_URL}/`)
    check('/ after sign out redirects to /sign-in', pathOf(page) === '/sign-in', page.url())
    await context.close()
  } catch (error) {
    check('smoke run completed', false, error instanceof Error ? error.message : String(error))
  } finally {
    await browser.close()
  }
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

await main()
