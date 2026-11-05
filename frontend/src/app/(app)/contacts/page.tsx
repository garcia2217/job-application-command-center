import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Panel } from '@/components/ui/panel'
import { Row, RowList, RowMeta, RowTitle } from '@/components/ui/row'
import { api } from '@/lib/api'
import { requireSession } from '@/lib/session'
import { contactsSubtitle } from '@/lib/summary'

export default async function ContactsPage() {
  await requireSession()
  // sorted by name (case-insensitive) by the backend
  const contacts = await api.contacts.list()

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={contactsSubtitle(contacts.length)}
        actions={
          contacts.length > 0 && (
            <ButtonLink href="/contacts/new" variant="secondary">
              Add contact
            </ButtonLink>
          )
        }
      />
      <Panel>
        {contacts.length === 0 ? (
          <EmptyState
            title="No contacts yet"
            body="Add the people you talk to at each company."
            action={{ href: '/contacts/new', label: 'Add contact' }}
          />
        ) : (
          <RowList label="Contacts">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <Row href={`/contacts/${contact.id}/edit`}>
                  <RowTitle>
                    {contact.name}
                    {contact.title && <span className="font-normal text-text-muted"> · {contact.title}</span>}
                  </RowTitle>
                  <RowMeta
                    items={[
                      contact.company_name,
                      contact.email && (
                        <span key="email" className="break-all">
                          {contact.email}
                        </span>
                      ),
                    ]}
                  />
                </Row>
              </li>
            ))}
          </RowList>
        )}
      </Panel>
    </>
  )
}
