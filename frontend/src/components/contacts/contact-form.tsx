'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/actions/form-state'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Panel } from '@/components/ui/panel'
import type { CompanyRef } from '@/lib/types'

type ContactFormProps = {
  /** createContact, or updateContact bound to the id */
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  /**
   * `fixed`: the company is shown as text (arriving from a company or application,
   * and always on edit). `choose`: a select of every company (create only).
   */
  company: { fixed: CompanyRef; submit: boolean } | { choose: CompanyRef[] }
  /** create from an application: linked after saving */
  applicationId?: number | null
  /** edit: the record's current values (contactFormValues) */
  initial?: Record<string, string>
  cancelHref: string
}

const initialState: FormState = {}

export function ContactForm({ action, company, applicationId, initial, cancelHref }: ContactFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState)
  const values = state.values ?? initial ?? {}
  const errors = state.errors ?? {}
  const formError = [state.message, ...(errors._ ?? [])].filter(Boolean)

  // React 19 resets the form after each action, and a select only applies its
  // defaultValue on mount: remount it with every result (as in ApplicationForm).
  const [version, setVersion] = useState(0)
  const [seen, setSeen] = useState(state)
  if (seen !== state) {
    setSeen(state)
    setVersion((v) => v + 1)
  }

  return (
    <form action={formAction} noValidate>
      {applicationId != null && <input type="hidden" name="application_id" value={String(applicationId)} />}
      <Panel padded>
        <div className="flex flex-col gap-4">
          {'fixed' in company ? (
            <div>
              <p className="mb-1 text-body font-medium text-text">Company</p>
              <p className="text-body text-text-muted break-words">{company.fixed.name}</p>
              {company.submit && <input type="hidden" name="company_id" value={String(company.fixed.id)} />}
              {errors.company_id?.map((error, index) => (
                <p key={index} className="mt-1 text-meta text-danger">
                  {error}
                </p>
              ))}
            </div>
          ) : (
            <Field
              as="select"
              label="Company"
              name="company_id"
              required
              key={`company-${version}`}
              defaultValue={values.company_id ?? ''}
              errors={errors.company_id}
            >
              <option value="" disabled>
                Choose a company
              </option>
              {company.choose.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </Field>
          )}

          <Field label="Name" name="name" required autoComplete="off" defaultValue={values.name} errors={errors.name} />
          <Field label="Title" name="title" defaultValue={values.title} errors={errors.title} />
          <Field
            label="Email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            defaultValue={values.email}
            errors={errors.email}
          />
          <Field
            label="LinkedIn URL"
            name="linkedin_url"
            type="url"
            inputMode="url"
            defaultValue={values.linkedin_url}
            errors={errors.linkedin_url}
          />
          <Field as="textarea" label="Notes" name="notes" rows={4} defaultValue={values.notes} errors={errors.notes} />

          {formError.length > 0 && (
            <InlineAlert tone="danger" role="alert">
              {formError.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </InlineAlert>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" pending={pending}>
              {pending ? 'Saving…' : 'Save contact'}
            </Button>
            <ButtonLink href={cancelHref} variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        </div>
      </Panel>
    </form>
  )
}
