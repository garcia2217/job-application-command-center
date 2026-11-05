// Every function takes an IANA zone explicitly and never uses the host zone (NFR-08).
type Parts = Partial<Record<Intl.DateTimeFormatPartTypes, string>>

function parts(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): Parts {
  const out: Parts = {}
  const formatter = new Intl.DateTimeFormat('en-GB', { ...options, timeZone, hourCycle: 'h23' })
  for (const part of formatter.formatToParts(date)) out[part.type] = part.value
  return out
}

function yearIn(date: Date, timeZone: string): string {
  return parts(date, timeZone, { year: 'numeric' }).year ?? ''
}

function dayMonth(date: Date, timeZone: string, now: Date): string {
  const p = parts(date, timeZone, { day: 'numeric', month: 'short', year: 'numeric' })
  // en-GB renders September as "Sept"; keep every short month three letters
  const base = `${p.day} ${p.month?.slice(0, 3)}`
  return p.year === yearIn(now, timeZone) ? base : `${base} ${p.year}`
}

function localDateKey(date: Date, timeZone: string): string {
  const p = parts(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

function hourMinute(date: Date, timeZone: string): string {
  const p = parts(date, timeZone, { hour: '2-digit', minute: '2-digit' })
  return `${p.hour}:${p.minute}`
}

// A date-time with an explicit Z or ±hh:mm / ±hhmm offset at the end.
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Every API timestamp is UTC (docs/API_CONTRACT.md), but some backends (SQLite)
 * emit them without an offset, which `new Date()` would read in the host's zone.
 * Treat an offset-less date-time as UTC; pass anything with an offset through.
 */
export function parseApiInstant(iso: string): Date {
  return new Date(HAS_OFFSET.test(iso) ? iso : `${iso}Z`)
}

export function formatDay(iso: string, timeZone: string, now: Date = new Date()): string {
  return dayMonth(parseApiInstant(iso), timeZone, now)
}

/** For `YYYY-MM-DD` values (date_applied): a calendar date, never shifted by a zone. */
export function formatDateOnly(date: string, now: Date = new Date()): string {
  return dayMonth(new Date(`${date}T00:00:00Z`), 'UTC', now)
}

export function formatDateTime(iso: string, timeZone: string, now: Date = new Date()): string {
  const date = parseApiInstant(iso)
  return `${dayMonth(date, timeZone, now)}, ${hourMinute(date, timeZone)}`
}

/** Value for an `<input type="datetime-local">`, in the account's zone. */
export function toLocalInput(iso: string | null, timeZone: string): string {
  if (!iso) return ''
  const date = parseApiInstant(iso)
  return `${localDateKey(date, timeZone)}T${hourMinute(date, timeZone)}`
}

/** Today's calendar date in the zone as `YYYY-MM-DD`, e.g. a date input's `max`. */
export function localDate(now: Date, timeZone: string): string {
  return localDateKey(now, timeZone)
}

export function todayTitle(now: Date, timeZone: string): string {
  const p = parts(now, timeZone, { weekday: 'long', day: 'numeric', month: 'long' })
  return `${p.weekday}, ${p.day} ${p.month}`
}

export function relativeActivity(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export type UpcomingParts = { day: string; date: string; time: string }

export function upcomingParts(iso: string, timeZone: string, now: Date = new Date()): UpcomingParts {
  const date = parseApiInstant(iso)
  const p = parts(date, timeZone, { weekday: 'short', day: 'numeric' })
  const isToday = localDateKey(date, timeZone) === localDateKey(now, timeZone)
  return { day: isToday ? 'Today' : (p.weekday ?? ''), date: p.day ?? '', time: hourMinute(date, timeZone) }
}

/** Matches the backend's limit counting (Unicode code points, not UTF-16 units). */
export function codePointLength(text: string): number {
  return [...text].length
}

/** SilentBadge danger tone: roughly 3x the quiet threshold (DESIGN_GUIDE §3). */
export function isUrgentSilence(days: number, threshold: number): boolean {
  return days >= threshold * 3
}
