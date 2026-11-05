import { notFound } from 'next/navigation'
import { updateApplication } from '@/actions/applications'
import { ApplicationForm } from '@/components/applications/application-form'
import { PageHeader } from '@/components/ui/page-header'
import { api, ApiError, parseId } from '@/lib/api'
import { applicationFormValues } from '@/lib/application-form'
import { localDate } from '@/lib/format'
import { requireSession } from '@/lib/session'

export default async function EditApplicationPage({ params }: PageProps<'/applications/[id]/edit'>) {
  await requireSession()
  const id = parseId((await params).id)
  const [application, companies, me] = await Promise.all([
    api.applications.get(id).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound()
      throw error
    }),
    api.companies.list(),
    api.auth.me(),
  ])

  return (
    <div className="max-w-form">
      <PageHeader title="Edit application" subtitle={`${application.company.name} · ${application.role_title}`} />
      <ApplicationForm
        mode="update"
        action={updateApplication.bind(null, id)}
        companies={companies}
        initial={applicationFormValues(application)}
        today={localDate(new Date(), me.timezone)}
        cancelHref={`/applications/${id}`}
      />
    </div>
  )
}
