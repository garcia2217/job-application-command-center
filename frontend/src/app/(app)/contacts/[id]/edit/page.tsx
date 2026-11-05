import { notFound } from 'next/navigation'
import { updateContact } from '@/actions/contacts'
import { ContactForm } from '@/components/contacts/contact-form'
import { DeleteContact } from '@/components/contacts/delete-contact'
import { PageHeader } from '@/components/ui/page-header'
import { api, ApiError, parseId } from '@/lib/api'
import { contactFormValues } from '@/lib/contacts'
import { requireSession } from '@/lib/session'

export default async function EditContactPage({ params }: PageProps<'/contacts/[id]/edit'>) {
  await requireSession()
  const id = parseId((await params).id)
  const [contact, companies] = await Promise.all([
    api.contacts.get(id).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound()
      throw error
    }),
    api.companies.list(),
  ])
  const company = companies.find((c) => c.id === contact.company_id)

  return (
    <div className="flex max-w-form flex-col gap-6">
      <div>
        <PageHeader title="Edit contact" subtitle={contact.name} />
        <ContactForm
          action={updateContact.bind(null, id)}
          // ContactUpdate has no company_id: a contact stays with its company
          company={{ fixed: { id: contact.company_id, name: company?.name ?? '' }, submit: false }}
          initial={contactFormValues(contact)}
          cancelHref="/contacts"
        />
      </div>
      <DeleteContact id={id} />
    </div>
  )
}
