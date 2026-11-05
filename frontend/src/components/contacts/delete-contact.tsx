'use client'

import { useActionState } from 'react'
import { deleteContact } from '@/actions/contacts'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'

const initialState: FormState = {}

/** Immediate delete, no confirmation (DESIGN_GUIDE §6). Its own form: never nested in the contact form. */
export function DeleteContact({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState(deleteContact.bind(null, id), initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div>
        <Button type="submit" variant="destructive" size="sm" pending={pending}>
          {pending ? 'Deleting…' : 'Delete contact'}
        </Button>
      </div>
      {state.message && (
        <InlineAlert tone="danger" role="alert">
          {state.message}
        </InlineAlert>
      )}
    </form>
  )
}
