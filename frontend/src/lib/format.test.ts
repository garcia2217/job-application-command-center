import { describe, expect, test } from 'bun:test'
import {
  codePointLength,
  formatDateOnly,
  formatDateTime,
  formatDay,
  isUrgentSilence,
  relativeActivity,
  toLocalInput,
  todayTitle,
  upcomingParts,
} from '@/lib/format'

const NOW = new Date('2026-11-05T12:00:00Z')

describe('formatDay', () => {
  test('same year omits the year', () => {
    expect(formatDay('2026-02-12T10:00:00Z', 'UTC', NOW)).toBe('12 Feb')
  })

  test('another year adds it', () => {
    expect(formatDay('2025-02-12T10:00:00Z', 'UTC', NOW)).toBe('12 Feb 2025')
  })

  test('renders in the given zone, not the host zone', () => {
    expect(formatDay('2026-03-01T00:30:00Z', 'America/New_York', NOW)).toBe('28 Feb')
  })

  test("the year rule uses now's year in the zone", () => {
    // 2027-01-01T02:00Z is still 31 Dec 2026 in New York, and now is in 2026 there too
    expect(formatDay('2027-01-01T02:00:00Z', 'America/New_York', NOW)).toBe('31 Dec')
    // now = 2027-01-01T02:00Z is 2027 in Tokyo, so a 2026 date gains its year
    expect(formatDay('2026-12-30T00:00:00Z', 'Asia/Tokyo', new Date('2027-01-01T02:00:00Z'))).toBe(
      '30 Dec 2026',
    )
  })
})

describe('formatDateOnly', () => {
  test('never shifts a calendar date', () => {
    expect(formatDateOnly('2026-02-12', NOW)).toBe('12 Feb')
    expect(formatDateOnly('2026-01-01', NOW)).toBe('1 Jan')
  })

  test('another year adds it', () => {
    expect(formatDateOnly('2025-12-31', NOW)).toBe('31 Dec 2025')
  })
})

describe('formatDateTime', () => {
  test('day, month and 24h time', () => {
    expect(formatDateTime('2026-11-05T14:02:00Z', 'UTC', NOW)).toBe('5 Nov, 14:02')
  })

  test('another year adds it', () => {
    expect(formatDateTime('2025-11-05T14:02:00Z', 'UTC', NOW)).toBe('5 Nov 2025, 14:02')
  })

  test('midnight is 00:00, never 24:00', () => {
    expect(formatDateTime('2026-11-05T00:00:00Z', 'UTC', NOW)).toBe('5 Nov, 00:00')
  })

  test('converts to the zone', () => {
    expect(formatDateTime('2026-11-05T05:02:00Z', 'Asia/Tokyo', NOW)).toBe('5 Nov, 14:02')
  })
})

describe('September is three letters like every other month', () => {
  test('formatDay, formatDateOnly, formatDateTime', () => {
    expect(formatDay('2026-09-14T10:00:00Z', 'UTC', NOW)).toBe('14 Sep')
    expect(formatDateOnly('2025-09-01', NOW)).toBe('1 Sep 2025')
    expect(formatDateTime('2026-09-14T09:05:00Z', 'UTC', NOW)).toBe('14 Sep, 09:05')
  })
})

describe('toLocalInput', () => {
  test('datetime-local value in the zone', () => {
    expect(toLocalInput('2026-11-05T05:02:00Z', 'Asia/Tokyo')).toBe('2026-11-05T14:02')
  })

  test('midnight', () => {
    expect(toLocalInput('2026-11-05T15:00:00Z', 'Asia/Tokyo')).toBe('2026-11-06T00:00')
  })

  test('null → empty', () => {
    expect(toLocalInput(null, 'UTC')).toBe('')
  })
})

describe('todayTitle', () => {
  test('weekday, day month', () => {
    expect(todayTitle(NOW, 'UTC')).toBe('Thursday, 5 November')
  })

  test('the zone decides the day near midnight UTC', () => {
    const late = new Date('2026-11-05T23:30:00Z')
    expect(todayTitle(late, 'UTC')).toBe('Thursday, 5 November')
    expect(todayTitle(late, 'Asia/Tokyo')).toBe('Friday, 6 November')
    expect(todayTitle(new Date('2026-11-05T02:00:00Z'), 'America/New_York')).toBe('Wednesday, 4 November')
  })
})

describe('relativeActivity', () => {
  test.each([
    [0, 'Today'],
    [1, 'Yesterday'],
    [2, '2 days ago'],
    [24, '24 days ago'],
  ])('%p → %p', (days, text) => {
    expect(relativeActivity(days)).toBe(text)
  })
})

describe('upcomingParts', () => {
  test('a stage today', () => {
    expect(upcomingParts('2026-11-05T15:00:00Z', 'UTC', NOW)).toEqual({ day: 'Today', date: '5', time: '15:00' })
  })

  test('a later stage shows the short weekday', () => {
    expect(upcomingParts('2026-11-16T10:30:00Z', 'UTC', NOW)).toEqual({ day: 'Mon', date: '16', time: '10:30' })
  })

  test("today is judged in the zone, not UTC", () => {
    // 2026-11-05T23:30Z is Friday 6 Nov 08:30 in Tokyo; now (12:00Z) is Thursday 5 Nov in Tokyo
    expect(upcomingParts('2026-11-05T23:30:00Z', 'Asia/Tokyo', NOW)).toEqual({
      day: 'Fri',
      date: '6',
      time: '08:30',
    })
    // both are 6 Nov in Tokyo once now is 2026-11-05T16:00Z
    expect(upcomingParts('2026-11-05T23:30:00Z', 'Asia/Tokyo', new Date('2026-11-05T16:00:00Z')).day).toBe('Today')
  })
})

describe('codePointLength', () => {
  test('counts code points, not UTF-16 units', () => {
    const text = '😀'.repeat(3)
    expect(text.length).toBe(6)
    expect(codePointLength(text)).toBe(3)
    expect(codePointLength('')).toBe(0)
  })
})

describe('isUrgentSilence', () => {
  test.each([
    [20, 7, false],
    [21, 7, true],
    [30, 7, true],
    [8, 3, false],
    [9, 3, true],
  ])('%p days at threshold %p → %p', (days, threshold, urgent) => {
    expect(isUrgentSilence(days, threshold)).toBe(urgent)
  })
})
