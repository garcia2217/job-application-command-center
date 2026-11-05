// Pure helpers for the interview stages section.
import { formatDateTime, toLocalInput } from './format'
import { OUTCOME_LABEL } from './labels'
import type { StageOutcome, StageResponse } from './types'

export type Direction = 'up' | 'down'

/** The order after moving one stage a place; the ends and unknown ids leave it unchanged. */
export function swap<T extends { id: number }>(stages: readonly T[], id: number, direction: Direction): T[] {
  const next = [...stages]
  const from = next.findIndex((stage) => stage.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from === -1 || to < 0 || to >= next.length) return next
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** A stage as the client list renders it; dates are formatted on the server, in the account's zone. */
export type StageView = {
  id: number
  name: string
  notes: string | null
  outcome: StageOutcome
  /** "5 Nov, 14:02 · Pending" or "Not scheduled · Pending" */
  meta: string
  /** the edit form's initial values, keyed by field name */
  values: Record<'name' | 'scheduled_at' | 'outcome' | 'notes', string>
}

export function stageViews(stages: StageResponse[], timeZone: string, now: Date = new Date()): StageView[] {
  return [...stages]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((stage) => ({
      id: stage.id,
      name: stage.name,
      notes: stage.notes,
      outcome: stage.outcome,
      meta: `${stage.scheduled_at ? formatDateTime(stage.scheduled_at, timeZone, now) : 'Not scheduled'} · ${OUTCOME_LABEL[stage.outcome]}`,
      values: {
        name: stage.name,
        scheduled_at: toLocalInput(stage.scheduled_at, timeZone),
        outcome: stage.outcome,
        notes: stage.notes ?? '',
      },
    }))
}
