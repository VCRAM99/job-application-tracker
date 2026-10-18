import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ApplicationForm } from "@/components/records/application-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { updateApplication } from "@/lib/records/actions"
import { getApplication, listCompanyOptions } from "@/lib/records/data"

export const metadata: Metadata = { title: "Edit application" }

function money(value: number | null): string {
  return value == null ? "" : String(value)
}

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [applicationResult, companies] = await Promise.all([
    getApplication(id),
    listCompanyOptions(),
  ])

  if (!applicationResult.ok || !companies.ok) {
    const missing =
      (applicationResult.ok === false && applicationResult.error === "missing_table") ||
      (companies.ok === false && companies.error === "missing_table")
    return (
      <RecordState
        tone="error"
        title="Application could not be loaded"
        description={
          missing
            ? "These tables are not available yet. Apply the companies and applications migration, then reload."
            : "This application could not be loaded. Refresh the page and try again."
        }
      />
    )
  }
  if (!applicationResult.data) notFound()
  const application = applicationResult.data

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={`Edit ${application.jobTitle}`}
        description={`Application at ${application.companyName}.`}
      />
      <ApplicationForm
        action={updateApplication}
        id={application.id}
        companies={companies.data}
        submitLabel="Save application"
        cancelHref={`/applications/${application.id}`}
        values={{
          jobTitle: application.jobTitle,
          jobUrl: application.jobUrl ?? "",
          source: application.source ?? "",
          location: application.location ?? "",
          workArrangement: application.workArrangement,
          employmentType: application.employmentType,
          salaryMin: money(application.salaryMin),
          salaryMax: money(application.salaryMax),
          salaryCurrency: application.salaryCurrency,
          status: application.status,
          appliedAt: application.appliedAt ?? "",
          nextFollowUpDate: application.nextFollowUpDate ?? "",
          notes: application.notes ?? "",
          companyMode: "existing",
          companyId: application.companyId,
          newCompanyName: "",
        }}
      />
    </div>
  )
}
