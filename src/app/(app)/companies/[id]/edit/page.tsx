import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CompanyForm } from "@/components/records/company-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { updateCompany } from "@/lib/records/actions"
import { getCompany } from "@/lib/records/data"

export const metadata: Metadata = { title: "Edit company" }

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getCompany(id)
  if (!result.ok) {
    return (
      <RecordState
        tone="error"
        title="Company could not be loaded"
        description={
          result.error === "missing_table"
            ? "These tables are not available yet. Apply the companies and applications migration, then reload."
            : "This company could not be loaded. Refresh the page and try again."
        }
      />
    )
  }
  if (!result.data) notFound()
  const company = result.data

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={`Edit ${company.name}`} description="Update the research record for this company." />
      <CompanyForm
        action={updateCompany}
        id={company.id}
        submitLabel="Save company"
        cancelHref={`/companies/${company.id}`}
        values={{
          name: company.name,
          size: company.size,
          location: company.location ?? "",
          industry: company.industry ?? "",
          researchStatus: company.researchStatus,
          priorityTier: company.priorityTier,
          reference: company.reference ?? "",
          websiteUrl: company.websiteUrl ?? "",
          notes: company.notes ?? "",
          followUpDate: company.followUpDate ?? "",
        }}
      />
    </div>
  )
}
