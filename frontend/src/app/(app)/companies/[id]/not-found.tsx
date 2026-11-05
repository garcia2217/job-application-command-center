import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'

export default function CompanyNotFound() {
  return (
    <>
      {/* one h1 per page (DESIGN_GUIDE §7); the EmptyState line says the same thing visibly */}
      <h1 className="sr-only">Company not found</h1>
      <Panel>
        <EmptyState
          title="This company doesn't exist or was deleted."
          action={{ href: '/companies', label: 'Back to companies' }}
        />
      </Panel>
    </>
  )
}
