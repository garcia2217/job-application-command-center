import { Button } from '@/components/ui/button'
import { InlineAlert } from '@/components/ui/inline-alert'

// No directive and no hooks: rendered only inside the client error boundaries.
export function ErrorNotice({ retry }: { retry: () => void }) {
  return (
    <InlineAlert tone="danger" role="alert">
      <p>Something went wrong loading this page.</p>
      <div className="mt-3">
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </InlineAlert>
  )
}
