import type { Metadata } from "next"

import {
  ApplicationForm,
  emptyApplicationForm,
} from "@/components/records/application-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { createApplication } from "@/lib/records/actions"
import { listCompanyOptions } from "@/lib/records/data"
import { isUuid } from "@/lib/records/form-state"

export const metadata: Metadata = { title: "Add application" }

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const requested = typeof params.company === "string" ? params.company : ""
  const companies = await listCompanyOptions()

  if (!companies.ok) {
    return (
      <RecordState
        tone="error"
        title="Companies could not be loaded"
        description={
          companies.error === "missing_table"
            ? "These tables are not available yet. Apply the companies and applications migration, then reload."
            : "Companies could not be loaded, so a new application cannot be saved yet."
        }
      />
    )
  }

  const companyId = isUuid(requested) && companies.data.some((company) => company.id === requested)
    ? requested
    : ""

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Add application"
        description="Choose a company you already track, or create one with the application."
      />
      <ApplicationForm
        action={createApplication}
        companies={companies.data}
        submitLabel="Create application"
        cancelHref="/applications"
        values={{
          ...emptyApplicationForm,
          companyMode: companyId || companies.data.length > 0 ? "existing" : "new",
          companyId,
        }}
      />
    </div>
  )
}
