import { STATUS_LABEL } from '@/lib/labels'
import type { ApplicationStatus } from '@/lib/types'
import { cx } from './cx'

// Full class names so Tailwind can see them
const DOT: Record<ApplicationStatus, string> = {
  wishlist: 'bg-status-wishlist',
  applied: 'bg-status-applied',
  interviewing: 'bg-status-interviewing',
  offer: 'bg-status-offer',
  rejected: 'bg-status-rejected',
  withdrawn: 'bg-status-withdrawn',
}

/** Dot + word; status is never color alone. */
export function StatusIndicator({ status }: { status: ApplicationStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-meta text-text-muted">
      <span aria-hidden="true" className={cx('size-dot flex-none rounded-full', DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}
