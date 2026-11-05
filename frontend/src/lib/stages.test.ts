import { describe, expect, test } from 'bun:test'
import { stageViews, swap } from '@/lib/stages'
import type { StageResponse } from '@/lib/types'

const ids = (list: { id: number }[]) => list.map((item) => item.id)
const three = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('swap', () => {
  test('AC-03.4: moving stage 3 up in 1, 2, 3 gives 1, 3, 2', () => {
    expect(ids(swap(three, 3, 'up'))).toEqual([1, 3, 2])
  })

  test('moving down swaps with the next stage', () => {
    expect(ids(swap(three, 1, 'down'))).toEqual([2, 1, 3])
  })

  test('the first stage cannot move up', () => {
    expect(ids(swap(three, 1, 'up'))).toEqual([1, 2, 3])
  })

  test('the last stage cannot move down', () => {
    expect(ids(swap(three, 3, 'down'))).toEqual([1, 2, 3])
  })

  test('an unknown id leaves the order alone', () => {
    expect(ids(swap(three, 9, 'up'))).toEqual([1, 2, 3])
  })

  test('does not mutate its input', () => {
    swap(three, 3, 'up')
    expect(ids(three)).toEqual([1, 2, 3])
  })
})

function stage(id: number, position: number, extra: Partial<StageResponse> = {}): StageResponse {
  return {
    id,
    application_id: 7,
    name: `Stage ${id}`,
    scheduled_at: null,
    outcome: 'pending',
    notes: null,
    position,
    created_at: '2026-11-01T10:00:00Z',
    ...extra,
  }
}

const NOW = new Date('2026-11-05T12:00:00Z')

describe('stageViews', () => {
  test('sorted by position, then id', () => {
    const views = stageViews([stage(1, 2), stage(2, 0), stage(3, 1), stage(4, 1)], 'UTC', NOW)
    expect(ids(views)).toEqual([2, 3, 4, 1])
  })

  test('scheduled: time in the account zone and the outcome word', () => {
    const [view] = stageViews(
      [stage(1, 0, { scheduled_at: '2026-11-05T05:02:00Z', outcome: 'passed', notes: 'Bring laptop' })],
      'Asia/Tokyo',
      NOW,
    )
    expect(view.meta).toBe('5 Nov, 14:02 · Passed')
    expect(view.values).toEqual({
      name: 'Stage 1',
      scheduled_at: '2026-11-05T14:02',
      outcome: 'passed',
      notes: 'Bring laptop',
    })
  })

  test('AC-03.5: not scheduled, pending', () => {
    const [view] = stageViews([stage(1, 0)], 'UTC', NOW)
    expect(view.meta).toBe('Not scheduled · Pending')
    expect(view.values).toEqual({ name: 'Stage 1', scheduled_at: '', outcome: 'pending', notes: '' })
  })
})
