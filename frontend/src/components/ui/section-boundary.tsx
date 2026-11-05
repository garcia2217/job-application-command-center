'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { Button } from './button'
import { InlineAlert } from './inline-alert'
import { SectionHead } from './section-head'

type SectionErrorProps = {
  /** same id and title as the section's own SectionHead */
  id: string
  title: string
}

// Partial failure (DESIGN_GUIDE §5): show what loaded, alert only the part that failed.
// catchError lets redirect()/notFound() through, so a 401 still reaches /session-expired.
// The error itself is never rendered (NFR-07); the server logs it.
function SectionError({ id, title }: SectionErrorProps, { retry }: ErrorInfo) {
  return (
    <section aria-labelledby={id}>
      <SectionHead id={id} title={title} />
      <InlineAlert tone="danger" role="alert">
        <p>Couldn&apos;t load this section.</p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </InlineAlert>
    </section>
  )
}

/** Error boundary around one independently streamed section: `<SectionBoundary id title>{…}</SectionBoundary>`. */
export const SectionBoundary = catchError(SectionError)
