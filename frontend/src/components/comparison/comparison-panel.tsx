import Link from 'next/link'
import { InlineAlert } from '@/components/ui/inline-alert'
import { Panel } from '@/components/ui/panel'
import { SectionHead } from '@/components/ui/section-head'
import { formatDateTime } from '@/lib/format'
import { BLOCKED_REASON_LINK, BLOCKED_REASON_TEXT } from '@/lib/labels'
import type { BlockedReason, ComparisonResponse, ComparisonStateResponse } from '@/lib/types'
import { CompareButton } from './compare-button'

type ComparisonPanelProps = {
  state: ComparisonStateResponse
  appId: number
  timezone: string
}

const REASON_ID = 'comparison-blocked'
const LINK = 'font-medium text-accent no-underline hover:underline'

/** Awaits the comparison the page started fetching, so a failure stays inside this section's boundary. */
export async function ComparisonSection({ state, ...props }: Omit<ComparisonPanelProps, 'state'> & {
  state: Promise<ComparisonStateResponse>
}) {
  return <ComparisonPanel state={await state} {...props} />
}

export function ComparisonPanel({ state, appId, timezone }: ComparisonPanelProps) {
  const { blocked_reason: blocked, comparison } = state

  return (
    <section aria-labelledby="comparison-h">
      <SectionHead id="comparison-h" title="Comparison" />
      <Panel padded>
        {comparison ? (
          <ComparisonResult comparison={comparison} blocked={blocked} appId={appId} timezone={timezone} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {!blocked && <p className="min-w-0 flex-1 text-body">Compare this job description against your resume.</p>}
            <CompareButton
              appId={appId}
              label="Compare"
              disabled={blocked !== null}
              describedBy={blocked ? REASON_ID : undefined}
            />
            {blocked && <Reason reason={blocked} appId={appId} />}
          </div>
        )}
      </Panel>
    </section>
  )
}

function ComparisonResult({
  comparison,
  blocked,
  appId,
  timezone,
}: {
  comparison: ComparisonResponse
  blocked: BlockedReason | null
  appId: number
  timezone: string
}) {
  const { matched, missing, requirement_count: total, match_percentage: pct } = comparison
  return (
    <div className="flex flex-col gap-6">
      {comparison.is_stale && (
        <InlineAlert tone="warn">Resume or job description changed since this comparison.</InlineAlert>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          {pct !== null ? (
            <>
              <p className="text-title-sm font-semibold tabular-nums desk:text-title">{pct}% match</p>
              <p className="text-body text-text-muted tabular-nums">
                {matched.length} of {total} {total === 1 ? 'requirement' : 'requirements'}
              </p>
            </>
          ) : (
            <p className="text-section font-medium">No recognised requirements found.</p>
          )}
          <p className="mt-1 text-meta text-text-faint tabular-nums">
            Ran {formatDateTime(comparison.ran_at, timezone)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <CompareButton
            appId={appId}
            label="Compare again"
            disabled={blocked !== null}
            describedBy={blocked ? REASON_ID : undefined}
          />
          {blocked && <Reason reason={blocked} appId={appId} />}
        </div>
      </div>
      <div className="grid gap-6 desk:grid-cols-2">
        <TermList id="matched-h" title="Matched" terms={matched} />
        <TermList id="missing-h" title="Missing" terms={missing} />
      </div>
    </div>
  )
}

/** The PRD reason beside the disabled button, with its fix linked (DESIGN_GUIDE §5 Disabled action). */
function Reason({ reason, appId }: { reason: BlockedReason; appId: number }) {
  const phrase = BLOCKED_REASON_LINK[reason]
  const [before, after] = BLOCKED_REASON_TEXT[reason].split(phrase)
  const href = reason === 'no_resume' ? '/settings' : `/applications/${appId}/edit`
  return (
    <p id={REASON_ID} className="text-body text-text-muted">
      {before}
      <Link href={href} className={LINK}>
        {phrase}
      </Link>
      {after}
    </p>
  )
}

// The headings carry the meaning: no colored pills (DESIGN_GUIDE §1).
function TermList({ id, title, terms }: { id: string; title: string; terms: string[] }) {
  return (
    <div>
      <h3 id={id} className="mb-2 text-body font-semibold">
        {title} <span className="tabular-nums">({terms.length})</span>
      </h3>
      {terms.length === 0 ? (
        <p className="text-body text-text-muted">None</p>
      ) : (
        <ul aria-labelledby={id} className="flex flex-col gap-1 text-body text-text">
          {terms.map((term) => (
            <li key={term} className="break-words">
              {term}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
