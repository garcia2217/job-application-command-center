import type { ReactNode } from 'react'

export type DefinitionItem = { term: string; value: ReactNode }

/** Skips items whose value is null, undefined, false or an empty string. */
export function DefinitionList({ items }: { items: DefinitionItem[] }) {
  const shown = items.filter(({ value }) => value !== null && value !== undefined && value !== false && value !== '')
  if (shown.length === 0) return null
  return (
    <dl className="flex flex-col gap-3">
      {shown.map(({ term, value }) => (
        <div key={term}>
          <dt className="text-meta text-text-faint">{term}</dt>
          <dd className="text-body text-text break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
