import Link from "next/link"

import { JobActionForm } from "@/components/jobs/job-action-form"
import {
  clearJobFeedback,
  hideJob,
  markAlreadyApplied,
  markNotInterested,
  saveJob,
  setEmployerStance,
  unhideJob,
  unsaveJob,
} from "@/lib/jobs/actions"
import type { JobActionState } from "@/lib/jobs/action-state"
import {
  ARRANGEMENT_LABELS,
  EMPLOYMENT_LABELS,
  METHOD_LABELS,
  SENIORITY_LABELS,
  formatCompensation,
  formatListingDate,
} from "@/lib/jobs/display"
import type { JobListing } from "@/lib/jobs/data"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

function ActionForm({
  action,
  postingId,
  label,
}: {
  action: (previous: JobActionState, formData: FormData) => Promise<JobActionState>
  postingId: string
  label: string
}) {
  return <JobActionForm action={action} fields={{ postingId }} label={label} />
}

export function JobCard({ job }: { job: JobListing }) {
  const compensation = formatCompensation(job)
  const applyUrl = job.applicationUrl || job.listingUrl
  const reasons = job.reasonsMatchScore
    ? job.reasons.filter((reason) => reason.points > 0 || reason.code.endsWith("unset") || reason.code.endsWith("unavailable") || reason.code.endsWith("unlisted") || reason.code.endsWith("unknown"))
    : []

  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base leading-6">{job.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {job.employerName ?? "Company not provided"}
              {job.locationText ? ` · ${job.locationText}` : ""}
              {job.countryCode ? ` · ${job.countryCode}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-sm">
            <span className="font-medium">Match estimate {job.matchScore}/100</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Preference and qualification match. Not an interview prediction.
            </span>
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Work arrangement</dt>
            <dd>{ARRANGEMENT_LABELS[job.workArrangement] ?? job.workArrangement}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employment</dt>
            <dd>{EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seniority</dt>
            <dd>{SENIORITY_LABELS[job.seniority] ?? job.seniority}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Compensation</dt>
            <dd>{compensation ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Application method</dt>
            <dd>{METHOD_LABELS[job.applicationMethod] ?? job.applicationMethod}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source</dt>
            <dd>{job.sourceName}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">{formatListingDate(job)}</p>
        {job.skills.length > 0 ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Mentioned skills: </span>
            {job.skills.join(", ")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No skills were named on this listing.</p>
        )}
        <div className="space-y-1 text-sm">
          <p className="font-medium">Why this estimate</p>
          {job.reasonsMatchScore ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {reasons.map((reason) => (
                <li key={reason.code}>{reason.text}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              This estimate uses verified skills, target roles, seniority, verified job titles, company preferences, and listing freshness.
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button nativeButton={false} render={<Link href={`/jobs/${job.id}`} />}>
          Details
        </Button>
        <Button nativeButton={false} render={<a href={applyUrl} target="_blank" rel="noopener noreferrer" />}>
          Apply
        </Button>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<a href={`/applications/new?posting=${job.id}`} />}
        >
          Add to tracker
        </Button>
        <div className="flex flex-wrap gap-2">
          {job.saved ? (
            <ActionForm action={unsaveJob} postingId={job.id} label="Unsave" />
          ) : (
            <ActionForm action={saveJob} postingId={job.id} label="Save" />
          )}
          {job.hidden ? (
            <ActionForm action={unhideJob} postingId={job.id} label="Unhide" />
          ) : (
            <ActionForm action={hideJob} postingId={job.id} label="Hide" />
          )}
          <ActionForm action={markNotInterested} postingId={job.id} label="Not interested" />
          <ActionForm action={markAlreadyApplied} postingId={job.id} label="Already applied" />
          {job.feedback ? <ActionForm action={clearJobFeedback} postingId={job.id} label="Clear feedback" /> : null}
          {job.employerId ? (
            <>
              <JobActionForm
                action={setEmployerStance}
                fields={{ employerId: job.employerId, stance: "preferred" }}
                label="Prefer company"
              />
              <JobActionForm
                action={setEmployerStance}
                fields={{ employerId: job.employerId, stance: "excluded" }}
                label="Exclude company"
              />
            </>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  )
}
