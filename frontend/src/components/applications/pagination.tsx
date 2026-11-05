import { ButtonLink } from '@/components/ui/button'
import { pageHref, type ListState } from '@/lib/list-links'

type PaginationProps = {
  page: number
  pageCount: number
  state: ListState
}

/** Below the list when there is more than one page; Previous/Next only where they lead somewhere. */
export function Pagination({ page, pageCount, state }: PaginationProps) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-center gap-3">
      {page > 1 && (
        <ButtonLink href={pageHref(state, page - 1)} variant="secondary" size="sm">
          Previous
        </ButtonLink>
      )}
      <span className="text-meta tabular-nums text-text-muted" aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount && (
        <ButtonLink href={pageHref(state, page + 1)} variant="secondary" size="sm">
          Next
        </ButtonLink>
      )}
    </nav>
  )
}
