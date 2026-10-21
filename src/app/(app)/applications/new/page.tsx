import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  ApplicationForm,
  emptyApplicationForm,
} from "@/components/records/application-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { linkedApplicationId, loadTrackerPosting } from "@/lib/jobs/data"
import { planCompany, prefillFromPosting } from "@/lib/jobs/prefill"
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
  const postingId = typeof params.posting === "string" ? params.posting : ""
  const assistedSource = params.source === "linkedin" || params.source === "indeed" ? params.source : ""
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

  let prefill = emptyApplicationForm
  let notice: string | null = null
  let trackedId: string | undefined
  if (isUuid(postingId)) {
    const linked = await linkedApplicationId(postingId)
    if (linked) redirect(`/applications/${linked}`)
    const posting = await loadTrackerPosting(postingId)
    if (posting.ok && posting.data) {
      const seeded = prefillFromPosting({
        title: posting.data.title,
        listingUrl: posting.data.listingUrl,
        applicationUrl: posting.data.applicationUrl,
        source: posting.data.sourceName,
        locationText: posting.data.locationText,
        workArrangement: posting.data.workArrangement,
        employmentType: posting.data.employmentType,
        compensationMin: posting.data.compensationMin,
        compensationMax: posting.data.compensationMax,
        currency: posting.data.currency,
        salaryPeriod: posting.data.salaryPeriod,
        requisitionId: posting.data.requisitionId,
      })
      const plan = planCompany(companies.data, posting.data.employerName ?? "")
      if (plan.ambiguous) {
        notice = `More than one of your companies is named ${posting.data.employerName}. Choose one before saving. Creating a new company is also an explicit choice.`
      }
      prefill = {
        ...emptyApplicationForm,
        ...seeded,
        companyMode: plan.mode,
        companyId: plan.companyId,
        newCompanyName: plan.newCompanyName,
      }
      trackedId = posting.data.id
    } else if (posting.ok) {
      notice = "That recommended job is no longer available. You can still add an application."
    } else if (posting.error === "missing_table") {
      notice = "Recommended jobs are not available yet. You can still add an application."
    }
  } else if (assistedSource) {
    prefill = {
      ...emptyApplicationForm,
      source: assistedSource,
      companyMode: companies.data.length > 0 ? "existing" : "new",
    }
    notice = "This form saves a role you found yourself. It does not add the listing to the shared job catalog."
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={trackedId ? "Add recommended job" : "Add application"}
        description={
          trackedId
            ? "Review the prefilled fields, then save. This does not submit an application to the employer."
            : "Choose a company you already track, or create one with the application."
        }
      />
      <ApplicationForm
        action={createApplication}
        companies={companies.data}
        submitLabel="Create application"
        cancelHref={trackedId ? "/jobs" : "/applications"}
        postingId={trackedId}
        lockSavedStatus={Boolean(trackedId)}
        companyNotice={notice}
        values={{
          ...prefill,
          companyMode: prefill.companyId || companyId || companies.data.length > 0 ? prefill.companyMode || "existing" : "new",
          companyId: prefill.companyId || companyId,
        }}
      />
    </div>
  )
}
