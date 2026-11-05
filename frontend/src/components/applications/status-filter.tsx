'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { FilterChip } from '@/components/ui/filter-chip'
import type { StatusCounts } from '@/lib/application-list'
import { STATUS_LABEL } from '@/lib/labels'
import { statusHref } from '@/lib/list-links'
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/types'

const CHIPS: Array<{ value: ApplicationStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  ...APPLICATION_STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] })),
]

/** URL-state filter; the parent must wrap it in <Suspense> (useSearchParams). */
export function StatusFilter({ counts, active }: { counts: StatusCounts; active: ApplicationStatus | undefined }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = active ?? 'all'

  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="mb-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {CHIPS.map((chip) => (
        <FilterChip
          key={chip.value}
          pressed={current === chip.value}
          count={counts[chip.value]}
          onClick={() => router.push(statusHref(pathname, searchParams.toString(), chip.value), { scroll: false })}
        >
          {chip.label}
        </FilterChip>
      ))}
    </div>
  )
}

/** Same footprint as the chip row, for the Suspense fallback. */
export function StatusFilterPlaceholder() {
  return <div aria-hidden="true" className="mb-3 min-h-9 pb-2" />
}
