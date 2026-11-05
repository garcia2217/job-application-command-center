import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'

export default function ContactNotFound() {
  return (
    <>
      {/* one h1 per page (DESIGN_GUIDE §7); the EmptyState line says the same thing visibly */}
      <h1 className="sr-only">Contact not found</h1>
      <Panel>
        <EmptyState
          title="This contact doesn't exist or was deleted."
          action={{ href: '/contacts', label: 'Back to contacts' }}
        />
      </Panel>
    </>
  )
}
