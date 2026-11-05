// Pure helpers for Settings and the digest preview.
import { codePointLength } from './format'
import type { SettingsResponse } from './types'

/** The backend's resume limit, in Unicode code points (docs/API_CONTRACT.md). */
export const RESUME_MAX = 50_000

const NUMBER = new Intl.NumberFormat('en-GB')

/**
 * Browsers submit textarea line breaks as CRLF; the DOM value (what the user sees
 * and the counter counts) uses LF. The resume is sent and round-tripped as LF so
 * the server counts what the counter showed.
 */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

// Both count the normalised text, so a CRLF value (e.g. round-tripped form input) matches the server.
export function resumeCounter(text: string): string {
  return `${NUMBER.format(codePointLength(normalizeLineBreaks(text)))} / ${NUMBER.format(RESUME_MAX)} characters`
}

export function isOverResumeLimit(text: string): boolean {
  return codePointLength(normalizeLineBreaks(text)) > RESUME_MAX
}

/**
 * Time zone select options: UTC first, then the runtime's IANA list, plus the
 * saved zone if the list lacks it (e.g. an older alias), so the select can show it.
 */
export function timezoneOptions(saved: string, supported: string[]): string[] {
  const zones = new Set(supported)
  zones.add(saved)
  zones.delete('UTC')
  return ['UTC', ...[...zones].sort()]
}

export function settingsFormValues(settings: SettingsResponse): Record<string, string> {
  return {
    quiet_threshold_days: String(settings.quiet_threshold_days),
    timezone: settings.timezone,
    resume_tex: settings.resume_tex ?? '',
  }
}

// The backend's reasons are run-record text ("Skipped: demo account"); drop that
// prefix and read the rest as a clause after the colon.
export function digestPreviewSubtitle(wouldSend: boolean, skipReason: string | null): string {
  if (wouldSend) return 'This is what a digest sent now would contain.'
  const reason = skipReason?.trim().replace(/^skipped:\s*/i, '')
  if (!reason) return 'Nothing would be sent now.'
  return `Nothing would be sent now: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`
}
