import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { AnalyzeForm } from "@/components/analyze/forms"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { jobAnalysisEnabled, jobAnalysisMockProvider } from "@/lib/ai/flags"
import { analysisBlockedReason } from "@/lib/analyze/readiness"
import { listAnalyses, loadAnalysisContext, loadApplicationPrefill, loadPostingText } from "@/lib/analyze/data"
import { isUuid } from "@/lib/records/form-state"

export const metadata: Metadata = { title: "Fit" }
export const instant = false

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!jobAnalysisEnabled()) {
    return (
      <RecordState
        title="Fit analysis is off"
        description="Set JOB_ANALYSIS_ENABLED=true and AI_FEATURES_ENABLED=true on the server. Existing tracking is unchanged."
      />
    )
  }
  await connection()
  const params = await searchParams
  const postingId = typeof params.posting === "string" ? params.posting : ""
  const applicationId = typeof params.application === "string" ? params.application : ""
  const [context, history, posting, application] = await Promise.all([
    loadAnalysisContext(),
    listAnalyses(),
    isUuid(postingId) ? loadPostingText(postingId) : Promise.resolve(null),
    isUuid(applicationId) ? loadApplicationPrefill(applicationId) : Promise.resolve(null),
  ])
  if (!context.ok) {
    return (
      <RecordState
        tone="error"
        title="Fit analysis is not available"
        description={
          context.error === "missing_table"
            ? "Apply the job intelligence migration on a non-production database, then reload."
            : "The analysis data could not be loaded."
        }
      />
    )
  }
  if (!history.ok) {
    return (
      <RecordState
        tone="error"
        title="Fit analysis is not available"
        description={
          history.error === "missing_table"
            ? "Apply the job intelligence migration on a non-production database, then reload."
            : "The analysis data could not be loaded."
        }
      />
    )
  }
  const defaults = {
    title: posting && posting.ok ? posting.title : application && application.ok ? application.title : "",
    company: posting && posting.ok ? posting.company ?? "" : application && application.ok ? application.company ?? "" : "",
    jdText:
      posting && posting.ok && posting.description
        ? posting.description
        : application && application.ok
          ? application.notes
          : "",
    postingId: posting && posting.ok ? postingId : "",
    applicationId: application && application.ok ? applicationId : "",
  }
  const mockProvider = jobAnalysisMockProvider()
  const blockedReason = analysisBlockedReason({
    settings: context.settings,
    hasByokKey: context.hasByokKey,
    mockProvider,
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Qualification match"
        description="Compare a job description with career facts you have verified. The estimate is calculated in the app."
      />
      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>
            Paste the job text, or open this page from a catalog posting or an application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyzeForm
            settings={context.settings}
            sources={context.sources}
            defaults={defaults}
            mockProvider={mockProvider}
            blockedReason={blockedReason}
          />
        </CardContent>
      </Card>
      <section className="grid gap-3" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-base font-medium">Past analyses</h2>
        {history.analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No analyses yet.</p>
        ) : (
          <ul className="grid gap-2">
            {history.analyses.map((item) => (
              <li key={item.id}>
                <Link href={`/analyze/${item.id}`} className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between">
                  <span>{item.title || "Untitled job"}{item.company ? ` · ${item.company}` : ""}</span>
                  <span className="text-muted-foreground">
                    {item.status === "complete" && item.score != null ? `${item.score} / 100` : item.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
