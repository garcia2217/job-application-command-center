import { redirect } from 'next/navigation'
import { parseId } from '@/lib/api'

// Contacts have no detail view; their edit page is the canonical URL.
export default async function ContactPage({ params }: PageProps<'/contacts/[id]'>) {
  redirect(`/contacts/${parseId((await params).id)}/edit`)
}
