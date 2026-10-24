import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { DetailList, PageHeader, RecordState } from "@/components/records/fields"
import { StatusForm } from "@/components/records/status-form"
import { Button } from "@/components/ui/button"
import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { deleteApplication } from "@/lib/records/actions"
import {
  APPLICATION_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  WORK_ARRANGEMENT_LABELS,
  isEmploymentType,
  isWorkArrangement,
} from "@/lib/records/constants"
import { getApplication } from "@/lib/records/data"
import { formatSalary } from "@/lib/records/logic"
import { isFollowUpDue } from "@/lib/records/query"

export const metadata: Metadata = { title: "Application" }

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getApplication(id)
  if (!result.ok) {
    return (
      <RecordState
        tone="error"
        title="Application could not be loaded"
        description={
          result.error === "missing_table"
            ? "These tables are not available yet. Apply the companies and applications migration, then reload."
            : "This application could not be loaded. Refresh the page and try again."
        }
      />
    )
  }
  if (!result.data) notFound()
  const application = result.data
  const date = today()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title={application.jobTitle}
        description={application.companyName}
        action={
          <div className="flex flex-wrap gap-2">
            {jobAnalysisEnabled() ? (
              <Button variant="outline" nativeButton={false} render={<Link href={`/analyze?application=${application.id}`} />}>
                Analyze fit
              </Button>
            ) : null}
            <Button variant="outline" nativeButton={false} render={<Link href={`/applications/${application.id}/edit`} />}>
              Edit
            </Button>
            <DeleteRecordButton
              action={deleteApplication}
              id={application.id}
              label="Delete application"
              title={`Delete ${application.jobTitle}?`}
              description="This removes the application. The company stays."
            />
          </div>
        }
      />
      <StatusForm id={application.id} status={application.status} />
      <DetailList
        items={[
          {
            label: "Company",
            value: (
              <Link href={`/companies/${application.companyId}`} className="underline-offset-4 hover:underline">
                {application.companyName}
              </Link>
            ),
          },
          { label: "Status", value: APPLICATION_STATUS_LABELS[application.status] },
          { label: "Source", value: application.source ?? "—" },
          {
            label: "Job posting",
            value: application.jobUrl ? (
              <a href={application.jobUrl} className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                {application.jobUrl}
              </a>
            ) : (
              "—"
            ),
          },
          { label: "Location", value: application.location ?? "—" },
          {
            label: "Work arrangement",
            value: isWorkArrangement(application.workArrangement)
              ? WORK_ARRANGEMENT_LABELS[application.workArrangement]
              : application.workArrangement,
          },
          {
            label: "Employment type",
            value: isEmploymentType(application.employmentType)
              ? EMPLOYMENT_TYPE_LABELS[application.employmentType]
              : application.employmentType,
          },
          {
            label: "Salary",
            value: formatSalary(application.salaryMin, application.salaryMax, application.salaryCurrency),
          },
          { label: "Applied", value: application.appliedAt ?? "—" },
          {
            label: "Follow-up",
            value: (
              <span className={isFollowUpDue(application.nextFollowUpDate, date) ? "text-destructive" : undefined}>
                {application.nextFollowUpDate ?? "—"}
              </span>
            ),
          },
        ]}
      />
      {application.notes ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="text-sm leading-6 whitespace-pre-wrap">{application.notes}</p>
        </section>
      ) : null}
    </div>
  )
}
