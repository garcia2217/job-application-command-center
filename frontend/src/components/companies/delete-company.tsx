'use client'

import { useActionState, useState } from 'react'
import { deleteCompany } from '@/actions/companies'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InlineAlert } from '@/components/ui/inline-alert'
import { deleteCompanyBody } from '@/lib/companies'

type DeleteCompanyProps = {
  id: number
  name: string
  applicationCount: number
  contactCount: number
}

const initialState: FormState = {}
const HEADING_ID = 'delete-company-h'

export function DeleteCompany({ id, name, applicationCount, contactCount }: DeleteCompanyProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(deleteCompany.bind(null, id), initialState)
  const close = () => setOpen(false)

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onClose={close} labelledBy={HEADING_ID}>
        {applicationCount > 0 ? (
          // AC-02.6: refused while the company has applications; no confirm button
          <>
            <h2 id={HEADING_ID} className="text-section">
              This company can&apos;t be deleted
            </h2>
            <p className="mt-2 text-body text-text-muted">Delete or move this company&apos;s applications first.</p>
            <div className="mt-6 flex justify-end">
              <Button variant="secondary" onClick={close}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id={HEADING_ID} className="text-section">
              Delete this company?
            </h2>
            <p className="mt-2 text-body text-text-muted">{deleteCompanyBody(name, contactCount)}</p>
            {state.message && (
              <div className="mt-4">
                <InlineAlert tone="danger" role="alert">
                  {state.message}
                </InlineAlert>
              </div>
            )}
            <form action={formAction} className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive-filled" pending={pending}>
                {pending ? 'Deleting…' : 'Delete company'}
              </Button>
            </form>
          </>
        )}
      </Dialog>
    </>
  )
}
