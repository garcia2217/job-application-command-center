import type { ReactNode } from 'react'
import { ButtonLink } from './button'

type EmptyStateProps = {
  title: ReactNode
  body?: ReactNode
  /** only where the PRD specifies one; always secondary */
  action?: { href: string; label: string }
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="px-4 py-8 text-center text-text-muted">
      <p className="mb-1 text-section font-medium text-text">{title}</p>
      {body && <p className="text-body">{body}</p>}
      {action && (
        <div className="mt-4">
          <ButtonLink href={action.href} variant="secondary">
            {action.label}
          </ButtonLink>
        </div>
      )}
    </div>
  )
}
