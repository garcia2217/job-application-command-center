'use client'

import { useActionState } from 'react'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'

type LinkContactFormProps = {
  /** linkContact bound to the application id */
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  /** the company's contacts not yet linked */
  contacts: { id: number; name: string }[]
}

const initialState: FormState = {}

export function LinkContactForm({ action, contacts }: LinkContactFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <Field as="select" label="Link a contact" name="contact_id" defaultValue="" errors={state.errors?.contact_id}>
        <option value="" disabled>
          Choose a contact
        </option>
        {contacts.map((contact) => (
          <option key={contact.id} value={String(contact.id)}>
            {contact.name}
          </option>
        ))}
      </Field>
      {state.message && (
        <InlineAlert tone="danger" role="alert">
          {state.message}
        </InlineAlert>
      )}
      <div>
        <Button type="submit" size="sm" pending={pending}>
          Link
        </Button>
      </div>
    </form>
  )
}
