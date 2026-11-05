import { createApplication } from '@/actions/applications'
import { ApplicationForm } from '@/components/applications/application-form'
import { PageHeader } from '@/components/ui/page-header'
import { api } from '@/lib/api'
import { localDate } from '@/lib/format'
import { requireSession } from '@/lib/session'

export default async function NewApplicationPage() {
  await requireSession()
  const [companies, me] = await Promise.all([api.companies.list(), api.auth.me()])

  return (
    <div className="max-w-form">
      <PageHeader title="Add application" />
      <ApplicationForm
        mode="create"
        action={createApplication}
        companies={companies}
        today={localDate(new Date(), me.timezone)}
        cancelHref="/applications"
      />
    </div>
  )
}
