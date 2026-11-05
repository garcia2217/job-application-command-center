import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { Row, RowList, RowMeta, RowTitle } from '@/components/ui/row'
import { SectionHead } from '@/components/ui/section-head'
import { SilentBadge } from '@/components/ui/silent-badge'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { api } from '@/lib/api'
import { formatDateOnly } from '@/lib/format'

/** Needs follow-up (F-04): the backend's quiet flags, oldest activity first. */
export async function FollowUpQueue({ threshold }: { threshold: number }) {
  const quiet = await api.applications.quiet()

  return (
    <section aria-labelledby="followup-h">
      <SectionHead id="followup-h" title="Needs follow-up" count={quiet.length} hint={`Quiet after ${threshold} days`} />
      <Panel>
        {quiet.length > 0 ? (
          <RowList>
            {quiet.map((application) => (
              <li key={application.id}>
                <Row
                  href={`/applications/${application.id}`}
                  trailing={<SilentBadge days={application.days_since_activity} threshold={threshold} />}
                >
                  <RowTitle>
                    {application.company.name}{' '}
                    <span className="font-normal text-text-muted">· {application.role_title}</span>
                  </RowTitle>
                  <RowMeta
                    items={[
                      <StatusIndicator key="status" status={application.status} />,
                      application.date_applied && `Applied ${formatDateOnly(application.date_applied)}`,
                    ]}
                  />
                </Row>
              </li>
            ))}
          </RowList>
        ) : (
          <QueueEmpty />
        )}
      </Panel>
    </section>
  )
}

async function QueueEmpty() {
  const runs = await api.settings.jobRuns()
  return runs.quiet_check === null ? (
    <EmptyState title="First check pending." body="The daily check hasn't run yet." />
  ) : (
    <EmptyState title="Nothing needs follow-up." body="Every active application has recent activity." />
  )
}
