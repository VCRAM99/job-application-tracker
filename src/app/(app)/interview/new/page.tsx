import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { CoachOff } from "@/components/coach/view"
import { GenerateQuestionsForm } from "@/components/coach/forms"
import { PageHeader, RecordState } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { listQuestionSets, loadCoachAnalysis } from "@/lib/coach/data"
import { careerCoachEnabled } from "@/lib/coach/flags"
import { loadExecutionMode } from "@/lib/resume/data"

export const metadata: Metadata = { title: "Interview prep" }
export const instant = false

export default async function NewInterviewPrepPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!careerCoachEnabled()) return <CoachOff />
  await connection()
  const query = await searchParams
  const analysisId = typeof query.analysis === "string" ? query.analysis : ""
  const [analysis, mode] = await Promise.all([loadCoachAnalysis(analysisId), loadExecutionMode()])
  if (!analysis) {
    return (
      <RecordState
        title="Choose a completed analysis"
        description="Questions are built from a fit analysis's requirements. Run one from an application first."
        action={<Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>Applications</Button>}
      />
    )
  }
  const existing = (await listQuestionSets(analysis.applicationId ? { applicationId: analysis.applicationId } : {})).filter((set) => set.analysisId === analysis.id)
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Interview prep"
        description={[analysis.title || "Untitled job", analysis.company].filter(Boolean).join(" · ")}
      />
      <p className="text-sm text-muted-foreground">{analysis.requirements.length} requirements · questions cite your verified facts only</p>
      <GenerateQuestionsForm analysisId={analysis.id} mode={mode.mode} nonce={crypto.randomUUID()} />
      {existing.length > 0 ? (
        <ul className="grid gap-2 text-sm">
          {existing.map((set) => (
            <li key={set.id}>
              <Link href={`/interview/${set.id}`} className="underline-offset-4 hover:underline">
                {set.questions.length} questions · {new Date(set.createdAt).toLocaleDateString("en-US")}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
