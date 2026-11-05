import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'

// Unknown URLs. Renders outside the (app) shell, so it centres itself like the sign-in page.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-form">
        {/* one h1 per page (DESIGN_GUIDE §7); the EmptyState line says the same thing visibly */}
        <h1 className="sr-only">Page not found</h1>
        <Panel>
          <EmptyState title="This page doesn't exist." action={{ href: '/', label: 'Home' }} />
        </Panel>
      </div>
    </main>
  )
}
