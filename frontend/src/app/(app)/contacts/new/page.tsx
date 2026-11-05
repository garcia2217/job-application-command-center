import { createContact } from '@/actions/contacts'
import { ContactForm } from '@/components/contacts/contact-form'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { api } from '@/lib/api'
import { sortByName } from '@/lib/companies'
import { contactReturnHref, newContactContext } from '@/lib/contacts'
import { requireSession } from '@/lib/session'

export default async function NewContactPage({ searchParams }: PageProps<'/contacts/new'>) {
  await requireSession()
  const [params, companies] = await Promise.all([searchParams, api.companies.list()])

  if (companies.length === 0) {
    return (
      <div className="max-w-form">
        <PageHeader title="Add contact" />
        <Panel>
          <EmptyState title="Add a company first" action={{ href: '/companies/new', label: 'Add company' }} />
        </Panel>
      </div>
    )
  }

  const { company, applicationId } = newContactContext(params, companies)
  const options = sortByName(companies).map(({ id, name }) => ({ id, name }))

  return (
    <div className="max-w-form">
      <PageHeader title="Add contact" />
      <ContactForm
        action={createContact}
        company={company ? { fixed: company, submit: true } : { choose: options }}
        applicationId={applicationId}
        cancelHref={company ? contactReturnHref(company.id, applicationId) : '/contacts'}
      />
    </div>
  )
}
