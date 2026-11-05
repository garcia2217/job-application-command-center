import type { ReactNode } from 'react'
import { signOut } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { AddApplicationButton } from './add-application-button'

/** `account` is the streamed "· demo account" / "· email" label. */
export function TopBar({ account }: { account: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface px-4 py-3 desk:px-6">
      <div className="min-w-0 truncate text-section font-semibold tracking-[-0.01em]">
        Command Center {account}
      </div>
      <div className="flex-1" />
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
      <AddApplicationButton />
    </header>
  )
}
