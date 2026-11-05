import { describe, expect, test } from 'bun:test'
import {
  RESUME_MAX,
  digestPreviewSubtitle,
  isOverResumeLimit,
  normalizeLineBreaks,
  resumeCounter,
  settingsFormValues,
  timezoneOptions,
} from '@/lib/settings'
import { codePointLength } from '@/lib/format'
import { settingsPayload } from '@/lib/payload'
import type { SettingsResponse } from '@/lib/types'

describe('resumeCounter', () => {
  test('grouped count over the limit', () => {
    expect(resumeCounter('')).toBe('0 / 50,000 characters')
    expect(resumeCounter('a'.repeat(12_345))).toBe('12,345 / 50,000 characters')
  })

  test('an emoji counts as one character (code points, AC-06.9)', () => {
    expect(resumeCounter('😀😀')).toBe('2 / 50,000 characters')
  })
})

describe('isOverResumeLimit', () => {
  test('50,000 is allowed, 50,001 is over', () => {
    expect(RESUME_MAX).toBe(50_000)
    expect(isOverResumeLimit('a'.repeat(50_000))).toBe(false)
    expect(isOverResumeLimit('a'.repeat(50_001))).toBe(true)
  })

  test('counts code points, not UTF-16 units', () => {
    expect(isOverResumeLimit('😀'.repeat(50_000))).toBe(false)
  })
})

describe('timezoneOptions', () => {
  test('UTC first, then the supported zones, without a duplicate UTC', () => {
    expect(timezoneOptions('UTC', ['Asia/Tokyo', 'UTC', 'Europe/Berlin'])).toEqual([
      'UTC',
      'Asia/Tokyo',
      'Europe/Berlin',
    ])
  })

  test('the saved zone is added when the list lacks it, in alphabetical place', () => {
    expect(timezoneOptions('Europe/Kiev', ['Asia/Tokyo', 'Europe/Berlin', 'Europe/Kyiv'])).toEqual([
      'UTC',
      'Asia/Tokyo',
      'Europe/Berlin',
      'Europe/Kiev',
      'Europe/Kyiv',
    ])
  })

  test('a saved zone already in the list is not repeated', () => {
    expect(timezoneOptions('Asia/Tokyo', ['Asia/Tokyo'])).toEqual(['UTC', 'Asia/Tokyo'])
  })
})

describe('settingsFormValues', () => {
  test('form strings from the settings; a missing resume is empty', () => {
    const settings: SettingsResponse = {
      id: 1,
      email: 'owner@example.com',
      is_demo: false,
      quiet_threshold_days: 7,
      timezone: 'Europe/Berlin',
      resume_tex: null,
      resume_updated_at: null,
      has_resume: false,
    }
    expect(settingsFormValues(settings)).toEqual({
      quiet_threshold_days: '7',
      timezone: 'Europe/Berlin',
      resume_tex: '',
    })
  })
})

describe('digestPreviewSubtitle', () => {
  test('would send', () => {
    expect(digestPreviewSubtitle(true, null)).toBe('This is what a digest sent now would contain.')
  })

  test('the stored "Skipped: …" prefix is not repeated', () => {
    expect(digestPreviewSubtitle(false, 'Skipped: demo account')).toBe('Nothing would be sent now: demo account.')
    expect(digestPreviewSubtitle(false, 'Skipped: nothing to report')).toBe(
      'Nothing would be sent now: nothing to report.',
    )
  })

  test('a reason without the prefix reads as a clause', () => {
    expect(digestPreviewSubtitle(false, 'Already sent this week')).toBe(
      'Nothing would be sent now: already sent this week.',
    )
  })

  test('no reason', () => {
    expect(digestPreviewSubtitle(false, null)).toBe('Nothing would be sent now.')
  })
})

describe('normalizeLineBreaks', () => {
  test('CRLF text round-trips as LF', () => {
    expect(normalizeLineBreaks('a\r\nb\r\n\r\nc')).toBe('a\nb\n\nc')
    expect(normalizeLineBreaks(normalizeLineBreaks('a\r\nb'))).toBe('a\nb')
  })

  test('LF text is unchanged', () => {
    expect(normalizeLineBreaks('a\nb')).toBe('a\nb')
  })
})

describe('the counter matches the server for textarea (CRLF) input', () => {
  const submitted = 'line one\r\nline two\r\n😀'

  test("the counter's initial count equals what the server counts", () => {
    const sent = settingsPayload({ resume_tex: submitted }).resume_tex as string
    expect(resumeCounter(submitted)).toBe(`${codePointLength(sent)} / 50,000 characters`)
    expect(resumeCounter(submitted)).toBe('19 / 50,000 characters')
  })

  test('the limit check counts the same way', () => {
    expect(isOverResumeLimit('a\r\n'.repeat(25_000))).toBe(false)
  })
})
