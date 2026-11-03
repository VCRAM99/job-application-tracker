import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { PageHeader, RecordState } from "@/components/records/fields"
import { TailorForm } from "@/components/resume/forms"
import { ResumeStudioOff } from "@/components/resume/off"
import { getAnalysis } from "@/lib/analyze/data"
import { isUuid } from "@/lib/records/form-state"
import { getResume, loadExecutionMode } from "@/lib/resume/data"
import { analyzeAllowed, resumesAllowed } from "@/lib/beta"

export const metadata: Metadata = { title: "Tailor resume" }
export const instant = false

export default async function TailorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await resumesAllowed())) return <ResumeStudioOff />
  if (!(await analyzeAllowed())) {
    return <RecordState title="Tailoring needs fit analysis" description="Set JOB_ANALYSIS_ENABLED=true on the server to tailor a resume to an analysis." />
  }
  await connection()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const analysisId = typeof query.analysis === "string" && isUuid(query.analysis) ? query.analysis : null
  const applicationId = typeof query.application === "string" && isUuid(query.application) ? query.application : null
  if (!analysisId) notFound()
  const [loaded, analysis, mode] = await Promise.all([getResume(id), getAnalysis(analysisId), loadExecutionMode()])
  if (!loaded) notFound()
  if (!analysis.ok || !analysis.analysis || analysis.analysis.status !== "complete") {
    return <RecordState title="Choose a completed analysis" description="Tailoring uses the requirements from a completed fit analysis." />
  }
  if (loaded.resume.parseStatus !== "parsed") {
    return <RecordState title="Parse this resume first" description="Tailoring edits the parsed sections." />
  }
  const record = analysis.analysis
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Tailor resume"
        subtitle={`${loaded.resume.label} → ${[record.title || "Untitled job", record.company].filter(Boolean).join(" · ")}`}
      />
      <p className="text-sm text-muted-foreground">
        {record.requirements.length} requirements · edits cite your verified facts only
      </p>
      <TailorForm resumeId={loaded.resume.id} analysisId={record.id} applicationId={applicationId ?? record.applicationId} mode={mode.mode} />
    </div>
  )
}
