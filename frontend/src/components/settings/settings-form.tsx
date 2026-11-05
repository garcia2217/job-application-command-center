'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/actions/form-state'
import { updateSettings } from '@/actions/settings'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Panel } from '@/components/ui/panel'
import { SectionHead } from '@/components/ui/section-head'
import { ResumeField } from './resume-field'

type SettingsFormProps = {
  /** the saved settings (settingsFormValues) */
  initial: Record<string, string>
  /** UTC first, then the IANA zones (timezoneOptions), computed on the server */
  timezones: string[]
  /** "Last saved …" for the resume, or null when there is none */
  resumeSaved: string | null
}

const initialState: FormState = {}

export function SettingsForm({ initial, timezones, resumeSaved }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateSettings, initialState)
  // after a successful save the page's revalidated props are the saved values
  const values = state.values ?? initial
  const errors = state.errors ?? {}
  const formError = [state.message, ...(errors._ ?? [])].filter(Boolean)

  // React 19 resets the form after each action; the select (defaultValue applies on
  // mount only) and the resume counter (its own state) remount with every result.
  const [version, setVersion] = useState(0)
  const [seen, setSeen] = useState(state)
  if (seen !== state) {
    setSeen(state)
    setVersion((v) => v + 1)
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-8">
      <section aria-labelledby="followup-settings-h">
        <SectionHead id="followup-settings-h" title="Follow-up and time zone" />
        <Panel padded>
          <div className="flex flex-col gap-4">
            <Field
              label="Quiet threshold (days)"
              name="quiet_threshold_days"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              step={1}
              required
              defaultValue={values.quiet_threshold_days}
              errors={errors.quiet_threshold_days}
              hint="Applications with no activity for this many days need follow-up. Takes effect at the next daily check."
            />
            <Field
              as="select"
              label="Time zone"
              name="timezone"
              key={`timezone-${version}`}
              defaultValue={values.timezone}
              errors={errors.timezone}
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Field>
          </div>
        </Panel>
      </section>

      <section aria-labelledby="resume-h">
        <SectionHead id="resume-h" title="Resume" />
        <Panel padded>
          <ResumeField
            key={`resume-${version}`}
            defaultValue={values.resume_tex ?? ''}
            errors={errors.resume_tex}
            lastSaved={resumeSaved}
          />
        </Panel>
      </section>

      {formError.length > 0 && (
        <InlineAlert tone="danger" role="alert">
          {formError.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </InlineAlert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
        {/* the saved change is otherwise invisible; no toasts (DESIGN_GUIDE §5) */}
        <p role="status" className="text-meta text-text-muted">
          {state.ok && !pending ? 'Settings saved.' : ''}
        </p>
      </div>
    </form>
  )
}
