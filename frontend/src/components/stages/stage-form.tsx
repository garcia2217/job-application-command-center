'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { OUTCOME_LABEL } from '@/lib/labels'
import { STAGE_OUTCOMES } from '@/lib/types'

type StageFormProps = {
  mode: 'create' | 'update'
  /** createStage / updateStage bound to the application (and stage) ids */
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  /** the account's IANA zone; scheduled times are entered in it (NFR-08) */
  timezone: string
  /** keeps field ids unique: the add form and an edit form can be open together */
  idPrefix: string
  /** edit: the stage's current values (StageView.values) */
  initial?: Record<string, string>
  /** edit: called after a successful save, and by Cancel */
  onDone?: () => void
}

const initialState: FormState = {}

export function StageForm({ mode, action, timezone, idPrefix, initial, onDone }: StageFormProps) {
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const next = await action(prev, formData)
    if (next.ok) onDone?.()
    return next
  }, initialState)
  const values = state.values ?? (state.ok ? {} : (initial ?? {}))
  const errors = state.errors ?? {}

  // React resets the form after each action, and a select only takes its
  // defaultValue on mount; remount it with each result so it shows the
  // round-tripped value (or the default after a successful add).
  const [version, setVersion] = useState(0)
  const [seen, setSeen] = useState(state)
  if (seen !== state) {
    setSeen(state)
    setVersion((v) => v + 1)
  }

  const formError = [state.message, ...(errors._ ?? [])].filter(Boolean)
  const headingId = `${idPrefix}heading`

  return (
    <form action={formAction} noValidate aria-labelledby={mode === 'create' ? headingId : undefined}>
      {mode === 'create' && (
        <h3 id={headingId} className="mb-3 text-section">
          Add stage
        </h3>
      )}
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          name="name"
          idPrefix={idPrefix}
          required
          autoComplete="off"
          defaultValue={values.name ?? ''}
          errors={errors.name}
        />
        <Field
          label="Scheduled"
          name="scheduled_at"
          idPrefix={idPrefix}
          type="datetime-local"
          defaultValue={values.scheduled_at ?? ''}
          hint={`In ${timezone}`}
          errors={errors.scheduled_at}
        />
        <Field
          as="select"
          label="Outcome"
          name="outcome"
          idPrefix={idPrefix}
          key={`outcome-${version}`}
          defaultValue={values.outcome ?? (mode === 'create' ? '' : 'pending')}
          errors={errors.outcome}
        >
          {/* create: '' is omitted from the payload, so the backend default applies (AC-03.5) */}
          {mode === 'create' && <option value="">Pending</option>}
          {STAGE_OUTCOMES.filter((outcome) => mode === 'update' || outcome !== 'pending').map((outcome) => (
            <option key={outcome} value={outcome}>
              {OUTCOME_LABEL[outcome]}
            </option>
          ))}
        </Field>
        <Field
          as="textarea"
          label="Notes"
          name="notes"
          idPrefix={idPrefix}
          rows={3}
          defaultValue={values.notes ?? ''}
          errors={errors.notes}
        />
        {formError.length > 0 && (
          <InlineAlert tone="danger" role="alert">
            {formError.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </InlineAlert>
        )}
        <div className="flex flex-wrap gap-3">
          {/* secondary: Compare is this screen's one primary */}
          <Button type="submit" variant="secondary" pending={pending}>
            {mode === 'create' ? 'Add stage' : 'Save stage'}
          </Button>
          {mode === 'update' && (
            <Button variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
