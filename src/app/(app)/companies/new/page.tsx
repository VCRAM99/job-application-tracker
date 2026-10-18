import type { Metadata } from "next"

import { CompanyForm, emptyCompanyForm } from "@/components/records/company-form"
import { PageHeader } from "@/components/records/fields"
import { createCompany } from "@/lib/records/actions"

export const metadata: Metadata = { title: "Add company" }

export default function NewCompanyPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Add company"
        description="Keep the same fields you would track on a spreadsheet: size, priority, research, and follow-up."
      />
      <CompanyForm
        action={createCompany}
        values={emptyCompanyForm}
        submitLabel="Create company"
        cancelHref="/companies"
      />
    </div>
  )
}
