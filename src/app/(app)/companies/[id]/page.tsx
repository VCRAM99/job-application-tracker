import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { DetailList, PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { deleteCompany, deleteApplication } from "@/lib/records/actions"
import {
  APPLICATION_STATUS_LABELS,
  COMPANY_SIZE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  PRIORITY_LABELS,
  RESEARCH_STATUS_LABELS,
  WORK_ARRANGEMENT_LABELS,
  isEmploymentType,
  isWorkArrangement,
} from "@/lib/records/constants"
import { getCompany, listApplications } from "@/lib/records/data"
import { formatSalary } from "@/lib/records/logic"
import { isFollowUpDue } from "@/lib/records/query"

export const metadata: Metadata = { title: "Company" }

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [companyResult, applicationsResult] = await Promise.all([
    getCompany(id),
    listApplications(),
  ])

  if (!companyResult.ok) {
    return (
      <RecordState
        tone="error"
        title="Company could not be loaded"
        description={
          companyResult.error === "missing_table"
            ? "These tables are not available yet. Apply the companies and applications migration, then reload."
            : "This company could not be loaded. Refresh the page and try again."
        }
      />
    )
  }
  if (!companyResult.data) notFound()

  const company = companyResult.data
  const linked = applicationsResult.ok
    ? applicationsResult.data.filter((application) => application.companyId === company.id)
    : []
  const date = today()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title={company.name}
        description={`${company.applicationCount} application${company.applicationCount === 1 ? "" : "s"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`/companies/${company.id}/edit`} />}>
              Edit
            </Button>
            <Button nativeButton={false} render={<Link href={`/applications/new?company=${company.id}`} />}>
              Add application
            </Button>
            <DeleteRecordButton
              action={deleteCompany}
              id={company.id}
              label="Delete company"
              title={`Delete ${company.name}?`}
              description="This deletes the company and its applications. Contacts and tasks stay, with those links cleared. This cannot be undone."
            />
          </div>
        }
      />
      <DetailList
        items={[
          { label: "Priority", value: PRIORITY_LABELS[company.priorityTier] },
          { label: "Size", value: COMPANY_SIZE_LABELS[company.size] },
          { label: "Research", value: RESEARCH_STATUS_LABELS[company.researchStatus] },
          { label: "Industry", value: company.industry ?? "—" },
          { label: "Location", value: company.location ?? "—" },
          { label: "Reference", value: company.reference ?? "—" },
          {
            label: "Website",
            value: company.websiteUrl ? (
              <a href={company.websiteUrl} className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                {company.websiteUrl}
              </a>
            ) : (
              "—"
            ),
          },
          {
            label: "Follow-up",
            value: (
              <span className={isFollowUpDue(company.followUpDate, date) ? "text-destructive" : undefined}>
                {company.followUpDate ?? "—"}
              </span>
            ),
          },
        ]}
      />
      {company.notes ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Notes</h2>
          <p className="text-sm leading-6 whitespace-pre-wrap">{company.notes}</p>
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Applications</h2>
        {!applicationsResult.ok ? (
          <RecordState
            tone="error"
            title="Applications could not be loaded"
            description="The company saved, but its applications could not be loaded."
          />
        ) : linked.length === 0 ? (
          <RecordState
            title="No applications yet"
            description="Applications you add for this company will show up here."
            action={
              <Button nativeButton={false} render={<Link href={`/applications/new?company=${company.id}`} />}>
                Add application
              </Button>
            }
          />
        ) : (
          <ul className="divide-y rounded-xl border">
            {linked.map((application) => (
              <li key={application.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/applications/${application.id}`} className="font-medium underline-offset-4 hover:underline">
                    {application.jobTitle}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {APPLICATION_STATUS_LABELS[application.status]}
                    {application.location ? ` · ${application.location}` : ""}
                    {isWorkArrangement(application.workArrangement)
                      ? ` · ${WORK_ARRANGEMENT_LABELS[application.workArrangement]}`
                      : ""}
                    {isEmploymentType(application.employmentType)
                      ? ` · ${EMPLOYMENT_TYPE_LABELS[application.employmentType]}`
                      : ""}
                    {` · ${formatSalary(application.salaryMin, application.salaryMax, application.salaryCurrency)}`}
                  </p>
                </div>
                <DeleteRecordButton
                  action={deleteApplication}
                  id={application.id}
                  returnTo={`/companies/${company.id}`}
                  label="Delete"
                  title={`Delete ${application.jobTitle}?`}
                  description="This removes the application. The company stays."
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
