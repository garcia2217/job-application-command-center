import Link from 'next/link'
import type { ReactNode } from 'react'

type SectionHeadProps = {
  /** id for the section's aria-labelledby */
  id: string
  title: string
  count?: number
  hint?: ReactNode
  link?: { href: string; label: string }
}

export function SectionHead({ id, title, count, hint, link }: SectionHeadProps) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 id={id} className="text-section">
        {title}
      </h2>
      {count !== undefined && <span className="text-meta text-text-faint tabular-nums">{count}</span>}
      <span className="flex-1" />
      {hint && <span className="text-meta text-text-faint">{hint}</span>}
      {link && (
        <Link href={link.href} className="text-meta font-medium text-accent no-underline hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  )
}
