import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { Row, RowList, RowMeta, RowTitle } from '@/components/ui/row'
import { SectionHead } from '@/components/ui/section-head'
import { SilentBadge } from '@/components/ui/silent-badge'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import { requireSession } from '@/lib/session'
import { digestPreviewSubtitle } from '@/lib/settings'

// Read-only: exactly what a send now would contain (AC-05.8). Items link inside the
// app by id, not by the email's absolute url.
export default async function DigestPreviewPage() {
  await requireSession()
  const [preview, me] = await Promise.all([api.settings.digestPreview(), api.auth.me()])
  const tz = me.timezone
  const now = new Date()

  return (
    <>
      <PageHeader
        title="Digest preview"
        subtitle={
          <>
            <p>{digestPreviewSubtitle(preview.would_send, preview.skip_reason)}</p>
            <p className="text-meta text-text-faint">
              Window: {formatDateTime(preview.window_start, tz, now)} – {formatDateTime(preview.window_end, tz, now)}
            </p>
          </>
        }
        actions={
          <ButtonLink href="/settings" variant="ghost">
            ← Settings
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-8">
        <section aria-labelledby="digest-quiet-h">
          <SectionHead id="digest-quiet-h" title="Needs follow-up" count={preview.quiet.length} />
          <Panel>
            {preview.quiet.length === 0 ? (
              <EmptyState title="Nothing to report." />
            ) : (
              <RowList>
                {preview.quiet.map((item) => (
                  <li key={item.application_id}>
                    <Row
                      href={`/applications/${item.application_id}`}
                      trailing={<SilentBadge days={item.days_since_activity} threshold={me.quiet_threshold_days} />}
                    >
                      <RowTitle>
                        {item.company} <span className="font-normal text-text-muted">· {item.role_title}</span>
                      </RowTitle>
                      <RowMeta items={[<StatusIndicator key="status" status={item.status} />]} />
                    </Row>
                  </li>
                ))}
              </RowList>
            )}
          </Panel>
        </section>

        <section aria-labelledby="digest-upcoming-h">
          <SectionHead id="digest-upcoming-h" title="Interviews this week" count={preview.upcoming.length} />
          <Panel>
            {preview.upcoming.length === 0 ? (
              <EmptyState title="Nothing to report." />
            ) : (
              <RowList>
                {preview.upcoming.map((stage, index) => (
                  <li key={`${stage.application_id}-${stage.scheduled_at}-${index}`}>
                    <Row href={`/applications/${stage.application_id}`}>
                      <RowTitle>{stage.stage_name}</RowTitle>
                      <RowMeta
                        items={[
                          <span key="app" className="break-words">
                            {stage.company} · {stage.role_title}
                          </span>,
                          <span key="when" className="tabular-nums">
                            {formatDateTime(stage.scheduled_at, tz, now)}
                          </span>,
                        ]}
                      />
                    </Row>
                  </li>
                ))}
              </RowList>
            )}
          </Panel>
        </section>
      </div>
    </>
  )
}
