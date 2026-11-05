import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { Row, RowList, RowMeta, RowTitle } from '@/components/ui/row'
import { api } from '@/lib/api'
import { sortByName, websiteHost } from '@/lib/companies'
import { requireSession } from '@/lib/session'
import { companiesSubtitle } from '@/lib/summary'

export default async function CompaniesPage() {
  await requireSession()
  const companies = sortByName(await api.companies.list())

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={companiesSubtitle(companies.length)}
        actions={
          companies.length > 0 && (
            <ButtonLink href="/companies/new" variant="secondary">
              Add company
            </ButtonLink>
          )
        }
      />
      <Panel>
        {companies.length === 0 ? (
          <EmptyState
            title="No companies yet"
            body="Companies are added with an application or here."
            action={{ href: '/companies/new', label: 'Add company' }}
          />
        ) : (
          <RowList label="Companies">
            {companies.map((company) => {
              const host = websiteHost(company.website)
              return (
                <li key={company.id}>
                  <Row href={`/companies/${company.id}`}>
                    <RowTitle>{company.name}</RowTitle>
                    {host && <RowMeta items={[host]} />}
                  </Row>
                </li>
              )
            })}
          </RowList>
        )}
      </Panel>
    </>
  )
}
