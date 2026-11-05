'use client'

import { usePathname } from 'next/navigation'
import { ButtonLink } from '@/components/ui/button'
import { hasOwnPrimary } from '@/lib/nav'

// One primary per screen: secondary wherever the page has its own primary action.
export function AddApplicationButton() {
  const pathname = usePathname()
  return (
    <ButtonLink href="/applications/new" size="sm" variant={hasOwnPrimary(pathname) ? 'secondary' : 'primary'}>
      Add application
    </ButtonLink>
  )
}
