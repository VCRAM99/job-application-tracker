import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { AnalysisResult } from "@/components/analyze/result"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { getAnalysis, loadAnalysisContext, loadFactLabels } from "@/lib/analyze/data"
import { isUuid } from "@/lib/records/form-state"

export const metadata: Metadata = { title: "Fit result" }
export const instant = false

export default async function AnalysisDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
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
  const { id } = await params
  if (!isUuid(id)) notFound()
  const [loaded, context] = await Promise.all([getAnalysis(id), loadAnalysisContext()])
  if (!loaded.ok) {
    return (
      <RecordState
        tone="error"
        title="This analysis could not be loaded"
        description={
          loaded.error === "missing_table"
            ? "Apply the job intelligence migration on a non-production database, then reload."
            : "Refresh the page and try again."
        }
      />
    )
  }
  if (!loaded.analysis) notFound()
  const analysis = loaded.analysis
  const factIds = analysis.matches.flatMap((match) => match.factIds)
  const factLabels = await loadFactLabels(factIds)
  const query = await searchParams
  const reused = query.reused === "1"
  const mode = context.ok ? context.settings?.executionMode ?? analysis.executionMode : analysis.executionMode

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title={analysis.title || "Qualification match"}
        description={analysis.company || "Job text compared with verified career facts."}
        action={
          <Button variant="outline" nativeButton={false} render={<Link href="/analyze" />}>
            All analyses
          </Button>
        }
      />
      <AnalysisResult analysis={analysis} factLabels={factLabels} executionMode={mode} reused={reused} />
    </div>
  )
}
