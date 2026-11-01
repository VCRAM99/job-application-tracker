import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { PageHeader } from "@/components/records/fields"
import { AnalysisPicker, ParseForm, ResumeMenu } from "@/components/resume/forms"
import { ResumeStudioOff } from "@/components/resume/off"
import { ResumePreview } from "@/components/resume/view"
import { HelpTip } from "@/components/ui/help-tip"
import { jobAnalysisEnabled } from "@/lib/ai/flags"
import { AI_ERROR_MESSAGES, type AiErrorCode } from "@/lib/ai/types"
import { getResume, listCompletedAnalyses, loadExecutionMode } from "@/lib/resume/data"
import { resumeStudioEnabled } from "@/lib/resume/flags"

export const metadata: Metadata = { title: "Resume" }
export const instant = false

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  if (!resumeStudioEnabled()) return <ResumeStudioOff />
  await connection()
  const { id } = await params
  const [loaded, mode, analyses] = await Promise.all([
    getResume(id),
    loadExecutionMode(),
    jobAnalysisEnabled() ? listCompletedAnalyses() : Promise.resolve([]),
  ])
  if (!loaded) notFound()
  const { resume, versions } = loaded
  const dropped = Object.values(resume.parseDropped).reduce((sum, value) => sum + (value ?? 0), 0)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={resume.label}
        description={`${resume.kind.toUpperCase()} · ${Math.max(1, Math.round(resume.sizeBytes / 1024))} KB`}
        action={<ResumeMenu resumeId={resume.id} label={resume.label} />}
      />
      {resume.parseStatus !== "parsed" || !resume.parseCurrent ? <ParseForm resumeId={resume.id} mode={mode.mode} /> : null}
      {resume.parseStatus === "failed" && resume.parseError ? (
        <p role="alert" className="text-sm text-destructive">
          {AI_ERROR_MESSAGES[resume.parseError as AiErrorCode] ?? "Parsing failed."}
        </p>
      ) : null}

      {resume.parsed ? (
        <section className="flex flex-col gap-3" aria-labelledby="parsed-heading">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="parsed-heading" className="text-sm font-medium">Parsed sections</h2>
            <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">AI-parsed · unverified</span>
            {dropped > 0 ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {dropped} dropped
                <HelpTip label="About dropped items">Items the model returned that are not in your file word for word. They are not shown or stored.</HelpTip>
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {resume.parseProvider} · {resume.parseModel} · {resume.parseMode === "managed" ? "Managed" : "Your key"}
          </p>
          <ResumePreview content={resume.parsed} />
        </section>
      ) : (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Extracted text</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">{resume.extractedText}</pre>
        </details>
      )}

      {resume.parsed && jobAnalysisEnabled() ? (
        <section className="flex flex-col gap-2" aria-labelledby="tailor-heading">
          <h2 id="tailor-heading" className="text-sm font-medium">Tailor to an analysis</h2>
          <AnalysisPicker resumeId={resume.id} analyses={analyses} />
        </section>
      ) : null}

      {versions.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="versions-heading">
          <h2 id="versions-heading" className="text-sm font-medium">Tailored versions</h2>
          <ul className="grid gap-2">
            {versions.map((version) => (
              <li key={version.id}>
                <Link href={`/resumes/${resume.id}/versions/${version.id}`} className="flex justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/60">
                  <span>{version.label}</span>
                  <span className="text-muted-foreground">
                    {version.accepted} accepted · {version.pending} pending
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
