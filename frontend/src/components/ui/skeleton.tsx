import { Panel } from './panel'

type SkeletonProps = {
  rows: number
  /** 'row': list rows with text bars; 'block': plain sunken blocks */
  variant?: 'row' | 'block'
}

export function Skeleton({ rows, variant = 'row' }: SkeletonProps) {
  const items = Array.from({ length: rows }, (_, index) => index)
  return (
    <>
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div aria-hidden="true">
        {variant === 'row' ? (
          <Panel>
            <ul className="divide-y divide-border">
              {items.map((index) => (
                <li key={index} className="flex min-h-row flex-col justify-center gap-2 px-4 py-3">
                  <span className="block h-4 w-1/2 rounded-sm bg-surface-sunken" />
                  <span className="block h-3 w-1/3 rounded-sm bg-surface-sunken" />
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel padded>
            <div className="flex flex-col gap-3">
              {items.map((index) => (
                <span key={index} className="block min-h-row rounded-sm bg-surface-sunken" />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}
