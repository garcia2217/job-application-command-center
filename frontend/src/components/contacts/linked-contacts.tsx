import Link from 'next/link'
import { linkContact, unlinkContact } from '@/actions/contacts'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { SectionHead } from '@/components/ui/section-head'
import { api } from '@/lib/api'
import { linkableContacts } from '@/lib/application-detail'
import type { ContactResponse } from '@/lib/types'
import { LinkContactForm } from './link-contact-form'
import { UnlinkButton } from './unlink-button'

type LinkedContactsProps = {
  appId: number
  companyId: number
  contacts: ContactResponse[]
}

const LINK = 'text-meta text-accent no-underline hover:underline break-all'

/** Rail section: linked contacts with Unlink, then linking one of the company's other contacts. Fetches the company. */
export async function LinkedContacts({ appId, companyId, contacts }: LinkedContactsProps) {
  const company = await api.companies.get(companyId)
  const linkable = linkableContacts(company.contacts, contacts)

  return (
    <section aria-labelledby="contacts-h">
      <SectionHead id="contacts-h" title="Contacts" count={contacts.length} />
      <Panel>
        {contacts.length === 0 ? (
          <EmptyState title="No contacts linked." />
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-section font-medium break-words">{contact.name}</p>
                  {contact.title && <p className="text-meta text-text-muted break-words">{contact.title}</p>}
                  {contact.email && (
                    <p>
                      <a href={`mailto:${contact.email}`} className={LINK}>
                        {contact.email}
                      </a>
                    </p>
                  )}
                  {contact.linkedin_url && (
                    <p>
                      <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className={LINK}>
                        LinkedIn
                      </a>
                    </p>
                  )}
                </div>
                <form action={unlinkContact.bind(null, appId, contact.id)} className="flex-none">
                  <UnlinkButton contactName={contact.name} />
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="mt-4 flex flex-col gap-3">
        {linkable.length > 0 && (
          <LinkContactForm
            action={linkContact.bind(null, appId)}
            contacts={linkable.map(({ id, name }) => ({ id, name }))}
          />
        )}
        <div>
          <Link
            href={`/contacts/new?company_id=${companyId}&application_id=${appId}`}
            className="text-meta font-medium text-accent no-underline hover:underline"
          >
            Add contact
          </Link>
        </div>
      </div>
    </section>
  )
}
