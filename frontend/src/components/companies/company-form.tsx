'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import type { FormState } from '@/actions/form-state'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Panel } from '@/components/ui/panel'

type CompanyFormProps = {
  /** createCompany, or updateCompany bound to the id */
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  /** edit: the record's current values (companyFormValues) */
  initial?: Record<string, string>
  cancelHref: string
}

const initialState: FormState = {}

// No selects, so React 19's post-action reset simply restores the round-tripped values.
export function CompanyForm({ action, initial, cancelHref }: CompanyFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState)
  const values = state.values ?? initial ?? {}
  const errors = state.errors ?? {}
  const formError = [state.message, ...(errors._ ?? [])].filter(Boolean)
  const existing = state.existingCompany

  return (
    <form action={formAction} noValidate>
      <Panel padded>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Field
              label="Name"
              name="name"
              required
              autoComplete="off"
              defaultValue={values.name}
              errors={errors.name}
            />
            {existing && (
              <p className="text-meta">
                {/* AC-02.4: offer the existing company */}
                <Link href={`/companies/${existing.id}`} className="font-medium text-accent no-underline hover:underline">
                  View {existing.name}
                </Link>
              </p>
            )}
          </div>

          <Field
            label="Website"
            name="website"
            type="url"
            inputMode="url"
            defaultValue={values.website}
            errors={errors.website}
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
              {pending ? 'Saving…' : 'Save company'}
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
