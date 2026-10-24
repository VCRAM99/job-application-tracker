import type { Metadata } from "next"
import Link from "next/link"

import { JobCard } from "@/components/jobs/job-card"
import { JobSearchForm } from "@/components/jobs/job-search-form"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { saveJobPreferences, saveSearch } from "@/lib/jobs/actions"
import { loadJobPreferences, searchJobs } from "@/lib/jobs/data"
import { recommendedJobsEnabled } from "@/lib/jobs/flags"
import { emptyJobSearch, JOB_PAGE_SIZE, jobSearchParams, parseJobSearch, type JobSearchState } from "@/lib/jobs/query"

export const metadata: Metadata = { title: "Recommended jobs" }

function defaultsFromPreferences(preferences: Awaited<ReturnType<typeof loadJobPreferences>>): JobSearchState {
  if (!preferences.ok || !preferences.data) return emptyJobSearch
  const row = preferences.data
  return {
    ...emptyJobSearch,
    keywords: row.keywords ?? "",
    countries: row.countries.filter((country) => country === "CA" || country === "US"),
    locations: row.locations,
    workArrangements: row.workArrangements,
    seniorities: row.seniorities,
    employmentTypes: row.employmentTypes,
    salaryMin: row.salaryMin == null ? "" : String(row.salaryMin),
    salaryCurrency: row.salaryCurrency,
    includeUnknownCompensation: row.includeUnknownCompensation,
    postedWithinDays: row.postedWithinDays ? String(row.postedWithinDays) : "",
    excludeEasyApply: row.excludeEasyApply,
  }
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!recommendedJobsEnabled()) {
    return (
      <RecordState
        title="Recommended jobs are off"
        description="This section stays off in production until the jobs migration and feature flag are approved."
      />
    )
  }

  const params = new URLSearchParams()
  const raw = await searchParams
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.append(key, value)
    else if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
  }
  const preferences = await loadJobPreferences()
  const state = parseJobSearch(params, defaultsFromPreferences(preferences))

  if (!preferences.ok && preferences.error === "missing_table") {
    return (
      <RecordState
        tone="error"
        title="Recommended jobs are not available yet"
        description="Apply the recommended jobs migration, then reload. The rest of the tracker still works."
      />
    )
  }

  const result = await searchJobs(state)
  const pageHref = (page: number) => {
    const next = jobSearchParams({ ...state, page })
    next.set("applied", "1")
    return `/jobs?${next.toString()}`
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title="Recommended jobs"
        description="Search the shared catalog with your preferences. Match estimates use verified career facts only."
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/jobs/alerts" />}>
            Job alerts
          </Button>
        }
      />
      <JobSearchForm state={state} savePreferences={saveJobPreferences} saveNamedSearch={saveSearch} />
      {!result.ok ? (
        <RecordState
          tone="error"
          title="Jobs could not be loaded"
          description={
            result.error === "missing_table"
              ? "Apply the recommended jobs migration, then reload. The rest of the tracker still works."
              : "The job list could not be loaded. Refresh the page and try again."
          }
        />
      ) : result.data.listings.length === 0 ? (
        <RecordState
          title="No matching jobs"
          description="No approved listings match these filters. External search links above are not part of the catalog."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{result.data.total} matching jobs</p>
          <div className="grid gap-4">
            {result.data.listings.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            {state.page > 1 ? (
              <Button variant="outline" nativeButton={false} render={<Link href={pageHref(state.page - 1)} />}>
                Previous
              </Button>
            ) : (
              <span />
            )}
            <p className="text-sm text-muted-foreground">Page {state.page}</p>
            {state.page * JOB_PAGE_SIZE < result.data.total ? (
              <Button variant="outline" nativeButton={false} render={<Link href={pageHref(state.page + 1)} />}>
                Next
              </Button>
            ) : (
              <span />
            )}
          </div>
        </>
      )}
    </div>
  )
}
