'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActive, NAV_ITEMS } from '@/lib/nav'
import { NavIconGlyph } from './nav-icons'

/** Mobile bottom nav: fixed, hidden from the desk breakpoint up. */
export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main (mobile)"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface desk:hidden"
      // not a token value: the device's home-indicator inset
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href, pathname) ? 'page' : undefined}
          className="flex min-h-bottomnav flex-1 flex-col items-center justify-center gap-1 text-nav text-text-muted no-underline aria-[current=page]:font-medium aria-[current=page]:text-accent"
        >
          <NavIconGlyph icon={item.icon} placement="bottom" className="size-5" />
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
