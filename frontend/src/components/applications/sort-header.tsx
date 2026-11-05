import Link from 'next/link'
import type { ApplicationSort } from '@/lib/application-list'
import { ariaSort, sortHref, type ListState } from '@/lib/list-links'
import { VisuallyHidden } from '@/components/ui/visually-hidden'

export const SORT_LABEL: Record<ApplicationSort, string> = {
  last_activity: 'Last activity',
  date_applied: 'Applied',
}

export const TH_CLASSES =
  'whitespace-nowrap border-b border-border px-4 py-3 text-left text-label font-medium uppercase tracking-[0.03em] text-text-faint'

function arrow(state: ListState, column: ApplicationSort): string | null {
  if (state.sort !== column) return null
  return state.order === 'asc' ? '↑' : '↓'
}

/** A sortable `th`: aria-sort on the cell, the arrow on the active column. */
export function SortHeader({ column, state }: { column: ApplicationSort; state: ListState }) {
  const mark = arrow(state, column)
  return (
    <th scope="col" aria-sort={ariaSort(state, column)} className={TH_CLASSES}>
      <Link href={sortHref(state, column)} scroll={false} className="no-underline hover:text-text">
        {SORT_LABEL[column]}
        {mark && <span aria-hidden="true"> {mark}</span>}
      </Link>
    </th>
  )
}

/** Mobile: cards have no headers, so the same two sort links sit above them. */
export function SortLinks({ state }: { state: ListState }) {
  const columns: ApplicationSort[] = ['last_activity', 'date_applied']
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2 text-meta text-text-muted desk:hidden">
      <span>Sort:</span>
      {columns.map((column, index) => {
        const mark = arrow(state, column)
        const direction = ariaSort(state, column)
        return (
          <span key={column} className="inline-flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">·</span>}
            <Link
              href={sortHref(state, column)}
              scroll={false}
              className={
                mark
                  ? 'inline-flex min-h-11 items-center font-medium text-accent no-underline'
                  : 'inline-flex min-h-11 items-center text-text-muted no-underline hover:text-text'
              }
            >
              {SORT_LABEL[column]}
              {mark && <span aria-hidden="true">&nbsp;{mark}</span>}
              {mark && <VisuallyHidden>, sorted {direction}</VisuallyHidden>}
            </Link>
          </span>
        )
      })}
    </p>
  )
}
