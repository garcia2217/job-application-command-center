import { isUrgentSilence } from '@/lib/format'
import { cx } from './cx'
import { VisuallyHidden } from './visually-hidden'

type SilentBadgeProps = {
  days: number
  threshold: number
  /** "24d" where space is tight (mobile cards) instead of "24d silent" */
  compact?: boolean
}

export function SilentBadge({ days, threshold, compact = false }: SilentBadgeProps) {
  const tone = isUrgentSilence(days, threshold) ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'
  return (
    <span className={cx('whitespace-nowrap rounded-full px-2 py-0.5 text-meta font-medium tabular-nums', tone)}>
      {days}d{compact ? <VisuallyHidden> silent</VisuallyHidden> : ' silent'}
    </span>
  )
}
