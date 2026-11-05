'use client'

import { useActionState, useState } from 'react'
import { deleteApplication } from '@/actions/applications'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InlineAlert } from '@/components/ui/inline-alert'

type DeleteApplicationProps = {
  id: number
  /** "{company} · {role}", named in the dialog body */
  name: string
}

const initialState: FormState = {}

export function DeleteApplication({ id, name }: DeleteApplicationProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(deleteApplication.bind(null, id), initialState)

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="delete-application-h">
        <h2 id="delete-application-h" className="text-section">
          Delete this application?
        </h2>
        <p className="mt-2 text-body text-text-muted">
          {name} and its interview stages and comparison will be permanently deleted.
        </p>
        {state.message && (
          <div className="mt-4">
            <InlineAlert tone="danger" role="alert">
              {state.message}
            </InlineAlert>
          </div>
        )}
        <form action={formAction} className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive-filled" pending={pending}>
            {pending ? 'Deleting…' : 'Delete application'}
          </Button>
        </form>
      </Dialog>
    </>
  )
}
