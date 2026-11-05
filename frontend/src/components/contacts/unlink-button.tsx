'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { VisuallyHidden } from '@/components/ui/visually-hidden'

/** Submit button for a bound unlinkContact form; pending comes from the enclosing form. */
export function UnlinkButton({ contactName }: { contactName: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="ghost" size="sm" pending={pending}>
      Unlink<VisuallyHidden> {contactName}</VisuallyHidden>
    </Button>
  )
}
