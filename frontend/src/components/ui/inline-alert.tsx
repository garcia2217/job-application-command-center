import type { AriaRole, ReactNode } from 'react'
import { cx } from './cx'

export type AlertTone = 'warn' | 'danger' | 'info'

const TONE: Record<AlertTone, string> = {
  warn: 'bg-warn-soft',
  danger: 'bg-danger-soft',
  info: 'bg-accent-soft',
}

type InlineAlertProps = {
  tone: AlertTone
  role?: AriaRole
  id?: string
  children: ReactNode
}

/** Soft semantic tint, left-aligned text. Not a toast, not a modal. */
export function InlineAlert({ tone, role, id, children }: InlineAlertProps) {
  return (
    <div id={id} role={role} className={cx('rounded-sm px-4 py-3 text-left text-body text-text', TONE[tone])}>
      {children}
    </div>
  )
}
