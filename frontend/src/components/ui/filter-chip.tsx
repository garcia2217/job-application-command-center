import type { ReactNode } from 'react'

type FilterChipProps = {
  pressed: boolean
  count: number
  onClick: () => void
  children: ReactNode
}

// No directive and no hooks: rendered only inside the client StatusFilter.
export function FilterChip({ pressed, count, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="group inline-flex min-h-9 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong bg-surface px-3 text-meta text-text-muted hover:bg-surface-sunken hover:text-text aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-medium aria-pressed:text-accent"
    >
      {children}
      <span className="tabular-nums text-text-faint group-aria-pressed:text-current">{count}</span>
    </button>
  )
}
