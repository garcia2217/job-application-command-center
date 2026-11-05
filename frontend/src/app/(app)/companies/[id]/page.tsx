import { notFound } from 'next/navigation'
import { ApplicationCards } from '@/components/applications/application-cards'
import { ApplicationsTable } from '@/components/applications/applications-table'
import { DeleteCompany } from '@/components/companies/delete-company'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { Row, RowList, RowMeta, RowTitle } from '@/components/ui/row'
import { SectionHead } from '@/components/ui/section-head'
import { api, ApiError, parseId } from '@/lib/api'
import { sortByName, websiteHost } from '@/lib/companies'
import { requireSession } from '@/lib/session'

export default async function CompanyPage({ params }: PageProps<'/companies/[id]'>) {
  await requireSession()
  const id = parseId((await params).id)
  const [company, me] = await Promise.all([
    api.companies.get(id).catch((error: unknown) => {
      // AC-01.7: another account's record is a 404 too
      if (error instanceof ApiError && error.status === 404) notFound()
      throw error
    }),
    api.auth.me(),
  ])
  const { applications } = company
  const contacts = sortByName(company.contacts)
  const host = websiteHost(company.website)
  const notes = company.notes?.trim() ? company.notes : null

  return (
    <>
      <PageHeader
        title={<span className="break-words">{company.name}</span>}
        subtitle={
          host && (
            <a
              href={company.website!}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-accent no-underline hover:underline"
            >
              {host}
            </a>
          )
        }
        actions={
          <>
            <ButtonLink href={`/companies/${id}/edit`} variant="secondary">
              Edit
            </ButtonLink>
            <DeleteCompany
              id={id}
              name={company.name}
              applicationCount={applications.length}
              contactCount={contacts.length}
            />
          </>
        }
      />
      <div className="flex flex-col gap-8">
        {notes && (
          <section aria-labelledby="notes-h">
            <SectionHead id="notes-h" title="Notes" />
            <Panel padded>
              <p className="whitespace-pre-wrap break-words text-body">{notes}</p>
            </Panel>
          </section>
        )}

        <section aria-labelledby="company-apps-h">
          <SectionHead id="company-apps-h" title="Applications" count={applications.length} />
          <Panel>
            {applications.length === 0 ? (
              <EmptyState title="No applications at this company." />
            ) : (
              <>
                <ApplicationsTable applications={applications} />
                <ApplicationCards applications={applications} threshold={me.quiet_threshold_days} />
              </>
            )}
          </Panel>
        </section>

        <section aria-labelledby="company-contacts-h">
          <SectionHead
            id="company-contacts-h"
            title="Contacts"
            count={contacts.length}
            link={{ href: `/contacts/new?company_id=${id}`, label: 'Add contact' }}
          />
          <Panel>
            {contacts.length === 0 ? (
              <EmptyState title="No contacts yet." />
            ) : (
              <RowList label="Contacts">
                {contacts.map((contact) => {
                  const meta = [
                    contact.title,
                    contact.email && (
                      <span key="email" className="break-all">
                        {contact.email}
                      </span>
                    ),
                  ].filter(Boolean)
                  return (
                    <li key={contact.id}>
                      <Row href={`/contacts/${contact.id}/edit`}>
                        <RowTitle>{contact.name}</RowTitle>
                        {meta.length > 0 && <RowMeta items={meta} />}
                      </Row>
                    </li>
                  )
                })}
              </RowList>
            )}
          </Panel>
        </section>
      </div>
    </>
  )
}
