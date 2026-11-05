import { Suspense } from 'react'
import { AccountLabel } from '@/components/shell/account-label'
import { BottomNav } from '@/components/shell/bottom-nav'
import { QuietBadge } from '@/components/shell/quiet-badge'
import { SideNav } from '@/components/shell/side-nav'
import { TopBar } from '@/components/shell/top-bar'
import { requireSession } from '@/lib/session'

// Cookie check only; the API-backed label and badge stream in their own Suspense
// boundaries so the shell and the page's loading.tsx show during a cold start.
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  await requireSession()

  return (
    <div className="min-h-screen">
      <TopBar
        account={
          <Suspense fallback={null}>
            <AccountLabel />
          </Suspense>
        }
      />
      <div className="desk:grid desk:grid-cols-[var(--spacing-sidebar)_minmax(0,1fr)] desk:items-start">
        <SideNav
          applicationsBadge={
            <Suspense fallback={null}>
              <QuietBadge />
            </Suspense>
          }
        />
        <main className="mx-auto w-full max-w-main min-w-0 px-4 pt-6 pb-nav-clear desk:px-8 desk:pt-8 desk:pb-12">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
