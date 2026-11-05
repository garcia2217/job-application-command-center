'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { isActive, NAV_ITEMS } from '@/lib/nav'
import { NavIconGlyph } from './nav-icons'

/** Desktop sidebar. `applicationsBadge` is a server-rendered slot (the streamed quiet count). */
export function SideNav({ applicationsBadge }: { applicationsBadge?: ReactNode }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="sticky top-topbar hidden h-[calc(100vh-var(--spacing-topbar))] border-r border-border bg-surface px-3 py-6 desk:block"
    >
      <ul className="grid gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, pathname)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-3 rounded-sm px-3 py-2 text-body text-text-muted no-underline hover:bg-surface-sunken hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent"
              >
                <NavIconGlyph icon={item.icon} placement="side" className="size-4.5 flex-none" />
                {item.label}
                {item.icon === 'applications' && applicationsBadge}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
