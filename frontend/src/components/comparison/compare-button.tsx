'use client'

import { useActionState } from 'react'
import { runComparison } from '@/actions/comparisons'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'

type CompareButtonProps = {
  appId: number
  label: 'Compare' | 'Compare again'
  /** blocked: dimmed, described by the reason text beside it */
  disabled?: boolean
  describedBy?: string
}

const initialState: FormState = {}

export function CompareButton({ appId, label, disabled = false, describedBy }: CompareButtonProps) {
  const [state, formAction, pending] = useActionState(runComparison.bind(null, appId), initialState)
  // once the page has refreshed into the blocked state, the reason beside the button says the same thing
  const message = disabled ? undefined : state.message

  return (
    <form action={formAction} className="flex flex-col items-start">
      <Button type="submit" variant="primary" pending={pending} disabled={disabled} aria-describedby={describedBy}>
        {pending ? 'Comparing…' : label}
      </Button>
      <p role="status" className="mt-2 text-meta text-danger empty:mt-0">
        {message}
      </p>
    </form>
  )
}
