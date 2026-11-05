import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { cx } from './cx'

/** The `<ul>` around Rows: 1px border between siblings, none after the last. */
export function RowList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="divide-y divide-border" aria-label={label}>
      {children}
    </ul>
  )
}

type RowProps = {
  href: string
  children: ReactNode
  /** fixed-width column before the text, e.g. the week rail's date block */
  leading?: ReactNode
  /** right-aligned, e.g. a SilentBadge */
  trailing?: ReactNode
  align?: 'center' | 'start'
}

/** A full-row link inside a Panel. Render it inside an `<li>` of a RowList. */
export function Row({ href, children, leading, trailing, align = 'center' }: RowProps) {
  return (
    <Link
      href={href}
      className={cx(
        'flex min-h-row gap-3 px-4 py-3 no-underline hover:bg-surface-sunken',
        align === 'start' ? 'items-start' : 'items-center',
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing}
    </Link>
  )
}

/** Row primary line: 15px/500, one line with ellipsis. */
export function RowTitle({ children }: { children: ReactNode }) {
  return <span className="block truncate text-section font-medium">{children}</span>
}

/** Row metadata line: 13px muted, items separated by a decorative "·". */
export function RowMeta({ items }: { items: ReactNode[] }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false && item !== '')
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-meta text-text-muted">
      {shown.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <span>{item}</span>
        </Fragment>
      ))}
    </span>
  )
}
