import { createCompany } from '@/actions/companies'
import { CompanyForm } from '@/components/companies/company-form'
import { PageHeader } from '@/components/ui/page-header'
import { requireSession } from '@/lib/session'

export default async function NewCompanyPage() {
  await requireSession()
  return (
    <div className="max-w-form">
      <PageHeader title="Add company" />
      <CompanyForm action={createCompany} cancelHref="/companies" />
    </div>
  )
}
