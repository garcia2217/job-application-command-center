import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { Row, RowList, RowTitle } from '@/components/ui/row'
import { SectionHead } from '@/components/ui/section-head'
import { cx } from '@/components/ui/cx'
import { api } from '@/lib/api'
import { upcomingParts } from '@/lib/format'

/** Next 7 days: scheduled interview stages, soonest first, in the account's zone. */
export async function UpcomingList({ timeZone }: { timeZone: string }) {
  const upcoming = await api.stages.upcoming()
  const now = new Date()

  return (
    <section aria-labelledby="week-h">
      <SectionHead id="week-h" title="Next 7 days" count={upcoming.length} />
      <Panel>
        {upcoming.length > 0 ? (
          <RowList>
            {upcoming.map((stage, index) => {
              const when = upcomingParts(stage.scheduled_at, timeZone, now)
              return (
                <li key={`${stage.application_id}-${stage.scheduled_at}-${index}`}>
                  <Row
                    href={`/applications/${stage.application_id}`}
                    align="start"
                    leading={
                      <span className="w-when flex-none pt-0.5 text-center">
                        <span
                          className={cx(
                            'block text-nav uppercase tracking-[0.06em]',
                            when.day === 'Today' ? 'font-semibold text-accent' : 'text-text-faint',
                          )}
                        >
                          {when.day}
                        </span>
                        <span className="block text-week-date font-semibold tabular-nums">{when.date}</span>
                        <span className="block text-label tabular-nums text-text-muted">{when.time}</span>
                      </span>
                    }
                  >
                    <RowTitle>{stage.stage_name}</RowTitle>
                    <span className="mt-0.5 block truncate text-meta text-text-muted">
                      {stage.company} · {stage.role_title}
                    </span>
                  </Row>
                </li>
              )
            })}
          </RowList>
        ) : (
          <EmptyState title="No interviews in the next 7 days." />
        )}
      </Panel>
    </section>
  )
}
