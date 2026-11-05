import { DefinitionList } from '@/components/ui/definition-list'
import { Panel } from '@/components/ui/panel'
import { SectionHead } from '@/components/ui/section-head'
import { formatSalary } from '@/lib/application-detail'
import { formatDateOnly } from '@/lib/format'
import { ARRANGEMENT_LABEL } from '@/lib/labels'
import type { ApplicationDetailResponse } from '@/lib/types'

/** Rail: the Details list (hidden when every field is empty), then Notes when there are any. */
export function ApplicationDetails({ application }: { application: ApplicationDetailResponse }) {
  const items = [
    { term: 'Applied', value: application.date_applied && formatDateOnly(application.date_applied) },
    {
      term: 'Posting',
      value: application.posting_url && (
        <a
          href={application.posting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent no-underline hover:underline"
        >
          {application.posting_url}
        </a>
      ),
    },
    { term: 'Location', value: application.location },
    { term: 'Arrangement', value: application.work_arrangement && ARRANGEMENT_LABEL[application.work_arrangement] },
    {
      term: 'Salary',
      value: formatSalary(application.salary_min, application.salary_max, application.salary_currency),
    },
    { term: 'Source', value: application.source },
  ]
  const hasDetails = items.some(({ value }) => value)
  const notes = application.notes?.trim() ? application.notes : null

  return (
    <>
      {hasDetails && (
        <section aria-labelledby="details-h">
          <SectionHead id="details-h" title="Details" />
          <Panel padded>
            <DefinitionList items={items} />
          </Panel>
        </section>
      )}
      {notes && (
        <section aria-labelledby="notes-h">
          <SectionHead id="notes-h" title="Notes" />
          <Panel padded>
            <p className="whitespace-pre-wrap break-words text-body">{notes}</p>
          </Panel>
        </section>
      )}
    </>
  )
}
