import type { ReactNode } from 'react'
import { cx } from './cx'

type PanelProps = {
  children: ReactNode
  /** 16px inner padding, for text panels (Automation, notes) rather than row lists */
  padded?: boolean
  className?: string
}

export function Panel({ children, padded = false, className }: PanelProps) {
  return (
    <div className={cx('overflow-hidden rounded-lg border border-border bg-surface shadow-panel dark:shadow-panel-dark', padded && 'p-4', className)}>
      {children}
    </div>
  )
}
