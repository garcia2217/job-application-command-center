import { notFound } from 'next/navigation'
import { updateCompany } from '@/actions/companies'
import { CompanyForm } from '@/components/companies/company-form'
import { PageHeader } from '@/components/ui/page-header'
import { api, ApiError, parseId } from '@/lib/api'
import { companyFormValues } from '@/lib/companies'
import { requireSession } from '@/lib/session'

export default async function EditCompanyPage({ params }: PageProps<'/companies/[id]/edit'>) {
  await requireSession()
  const id = parseId((await params).id)
  const company = await api.companies.get(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })

  return (
    <div className="max-w-form">
      <PageHeader title="Edit company" subtitle={company.name} />
      <CompanyForm
        action={updateCompany.bind(null, id)}
        initial={companyFormValues(company)}
        cancelHref={`/companies/${id}`}
      />
    </div>
  )
}
