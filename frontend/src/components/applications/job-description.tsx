import Link from 'next/link'
import { Panel } from '@/components/ui/panel'

type JobDescriptionProps = {
  text: string | null
  editHref: string
}

/** Collapsed by default: the full text is long and the comparison already summarises it. */
export function JobDescription({ text, editHref }: JobDescriptionProps) {
  const body = text?.trim() ? text : null
  return (
    <details>
      <summary className="cursor-pointer text-section font-semibold">Job description</summary>
      <div className="mt-3">
        <Panel padded>
          {body ? (
            <p className="whitespace-pre-wrap break-words text-body">{body}</p>
          ) : (
            <p className="text-body text-text-muted">
              No job description yet.{' '}
              <Link href={editHref} className="font-medium text-accent no-underline hover:underline">
                Add one
              </Link>
            </p>
          )}
        </Panel>
      </div>
    </details>
  )
}
