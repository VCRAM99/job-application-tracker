import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { StoredPostingAnalysis } from "@/components/analyze/forms"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { loadAnalysisContext, loadPostingText } from "@/lib/analyze/data"
import { recommendedJobsEnabled } from "@/lib/jobs/flags"
import { validateJobDescription } from "@/lib/analyze/text"
import { isUuid } from "@/lib/records/form-state"

export const metadata: Metadata = { title: "Job posting" }
export const instant = false

export default async function JobPostingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!recommendedJobsEnabled()) {
    return (
      <RecordState
        title="Recommended jobs are off"
        description="This section stays off in production until the jobs migration and feature flag are approved."
      />
    )
  }
  await connection()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const posting = await loadPostingText(id)
  if (!posting.ok) {
    if (posting.error === "missing") notFound()
    return (
      <RecordState
        tone="error"
        title="This posting could not be loaded"
        description="Refresh the page and try again."
      />
    )
  }
  const description = posting.description ?? ""
  const longEnough = validateJobDescription(description).ok
  const analysisOn = jobAnalysisEnabled()
  const context = analysisOn ? await loadAnalysisContext() : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={posting.title}
        description={posting.company || "Catalog posting"}
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/jobs" />}>
            Back to jobs
          </Button>
        }
      />
      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Description</h2>
        {description ? (
          <p className="text-sm leading-6 whitespace-pre-wrap">{description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">This listing has no description text.</p>
        )}
      </section>
      {analysisOn ? (
        <section className="grid gap-3">
          <h2 className="text-sm font-medium">Qualification match</h2>
          {context && !context.ok ? (
            <p className="text-sm text-muted-foreground">Fit analysis could not be loaded.</p>
          ) : longEnough && context?.ok && context.settings ? (
            <StoredPostingAnalysis postingId={id} executionMode={context.settings.executionMode} />
          ) : (
            <Button variant="outline" nativeButton={false} render={<Link href={`/analyze?posting=${id}`} />}>
              Analyze fit
            </Button>
          )}
          {longEnough ? null : (
            <p className="text-sm text-muted-foreground">
              The stored description is shorter than 200 characters. Add the full job text on the fit page.
            </p>
          )}
        </section>
      ) : null}
    </div>
  )
}
