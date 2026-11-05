'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import type { FormState } from '@/actions/form-state'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Panel } from '@/components/ui/panel'
import { companyOptions, NEW_COMPANY } from '@/lib/application-form'
import { ARRANGEMENT_LABEL, STATUS_LABEL } from '@/lib/labels'
import { APPLICATION_STATUSES, WORK_ARRANGEMENTS, type CompanyRef } from '@/lib/types'

type ApplicationFormProps = {
  mode: 'create' | 'update'
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  companies: CompanyRef[]
  /** edit: the record's current values (applicationFormValues) */
  initial?: Record<string, string>
  /** today in the account's zone, `YYYY-MM-DD`: the date input's max (a hint; the backend decides) */
  today: string
  cancelHref: string
}

const initialState: FormState = {}

export function ApplicationForm({ mode, action, companies, initial, today, cancelHref }: ApplicationFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState)
  const values = state.values ?? initial ?? {}
  const errors = state.errors ?? {}

  // React 19 resets the form after each action. Inputs and textareas reset to their
  // updated defaultValue (the round-tripped values), but React only applies a
  // select's defaultValue when it mounts, so a reset would put every select back
  // to its first value. Each select is therefore keyed by `version`, bumped with
  // every action result, and remounts with the new defaultValue.
  // `company` tracks the company select so "New company…" can reveal the name
  // field; "Use {name}" changes it and remounts only that select (`companyKey`).
  const [company, setCompany] = useState(values.company_id ?? '')
  const [version, setVersion] = useState(0)
  const [companyKey, setCompanyKey] = useState(0)
  const [seen, setSeen] = useState(state)
  if (seen !== state) {
    // follow each new action result (adjusting state during render, not in an effect)
    setSeen(state)
    setVersion((v) => v + 1)
    setCompany(state.values?.company_id ?? '')
  }

  function switchToExisting(id: number) {
    setCompany(String(id))
    setCompanyKey((key) => key + 1)
  }

  const options = companyOptions(companies, state.existingCompany)
  const isNew = mode === 'create' && company === NEW_COMPANY
  const formError = [state.message, ...(errors._ ?? [])].filter(Boolean)

  return (
    <form action={formAction} noValidate>
      <Panel padded>
        <div className="flex flex-col gap-4">
          <Field
            as="select"
            label="Company"
            name="company_id"
            required
            key={`${version}-${companyKey}`}
            defaultValue={company}
            onChange={(event) => setCompany(event.target.value)}
            errors={errors.company_id}
          >
            <option value="" disabled>
              Choose a company
            </option>
            {options.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.name}
              </option>
            ))}
            {mode === 'create' && <option value={NEW_COMPANY}>New company…</option>}
          </Field>

          {isNew && (
            <div className="flex flex-col gap-2">
              <Field
                label="New company name"
                name="company.name"
                required
                autoComplete="off"
                defaultValue={values['company.name']}
                errors={errors['company.name']}
              />
              {state.existingCompany && (
                <div>
                  <Button size="sm" onClick={() => switchToExisting(state.existingCompany!.id)}>
                    Use {state.existingCompany.name}
                  </Button>
                </div>
              )}
            </div>
          )}

          <Field
            label="Role title"
            name="role_title"
            required
            defaultValue={values.role_title}
            errors={errors.role_title}
          />

          <Field
            as="select"
            label="Status"
            name="status"
            key={`status-${version}`}
            defaultValue={values.status ?? 'applied'}
            errors={errors.status}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Field>

          <Field
            label="Date applied"
            name="date_applied"
            type="date"
            max={today}
            defaultValue={values.date_applied}
            errors={errors.date_applied}
          />

          <Field
            label="Posting URL"
            name="posting_url"
            type="url"
            inputMode="url"
            defaultValue={values.posting_url}
            errors={errors.posting_url}
          />

          <Field label="Location" name="location" defaultValue={values.location} errors={errors.location} />

          <Field
            as="select"
            label="Work arrangement"
            name="work_arrangement"
            key={`arrangement-${version}`}
            defaultValue={values.work_arrangement ?? ''}
            errors={errors.work_arrangement}
          >
            <option value="">Not set</option>
            {WORK_ARRANGEMENTS.map((arrangement) => (
              <option key={arrangement} value={arrangement}>
                {ARRANGEMENT_LABEL[arrangement]}
              </option>
            ))}
          </Field>

          <div className="grid gap-4 desk:grid-cols-3">
            <Field
              label="Salary min"
              name="salary_min"
              inputMode="numeric"
              defaultValue={values.salary_min}
              errors={errors.salary_min}
            />
            <Field
              label="Salary max"
              name="salary_max"
              inputMode="numeric"
              defaultValue={values.salary_max}
              errors={errors.salary_max}
            />
            <Field
              label="Currency"
              name="salary_currency"
              maxLength={3}
              autoCapitalize="characters"
              hint="e.g. EUR"
              className="uppercase"
              defaultValue={values.salary_currency}
              errors={errors.salary_currency}
            />
          </div>

          <Field label="Source" name="source" defaultValue={values.source} errors={errors.source} />

          <Field
            as="textarea"
            label="Job description"
            name="job_description"
            rows={8}
            defaultValue={values.job_description}
            errors={errors.job_description}
          />

          <Field as="textarea" label="Notes" name="notes" rows={4} defaultValue={values.notes} errors={errors.notes} />

          {formError.length > 0 && (
            <InlineAlert tone="danger" role="alert">
              {formError.map((message, index) => (
                <p key={index}>{message}</p>
              ))}
            </InlineAlert>
          )}

          {state.duplicateOf !== undefined ? (
            <InlineAlert tone="warn" role="alert">
              <p>
                You already have an application for this role at this company.{' '}
                <Link href={`/applications/${state.duplicateOf}`} className="font-medium text-accent">
                  View it
                </Link>
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button type="submit" variant="primary" name="confirm_duplicate" value="true" pending={pending}>
                  {pending ? 'Saving…' : 'Save anyway'}
                </Button>
                <ButtonLink href={cancelHref} variant="ghost">
                  Cancel
                </ButtonLink>
              </div>
            </InlineAlert>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" pending={pending}>
                {pending ? 'Saving…' : 'Save application'}
              </Button>
              <ButtonLink href={cancelHref} variant="ghost">
                Cancel
              </ButtonLink>
            </div>
          )}
        </div>
      </Panel>
    </form>
  )
}
