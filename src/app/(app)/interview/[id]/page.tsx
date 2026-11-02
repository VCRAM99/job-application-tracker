import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { DeleteMenu } from "@/components/coach/controls"
import { AddToPrep, PracticeForm } from "@/components/coach/interview-forms"
import { Badge, CoachOff, DroppedNote, MetaLine } from "@/components/coach/view"
import { PageHeader } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { HelpTip } from "@/components/ui/help-tip"
import { loadFactLabels } from "@/lib/analyze/data"
import { getQuestionSet, listPracticeAnswers, loadCoachAnalysis } from "@/lib/coach/data"
import { careerCoachEnabled } from "@/lib/coach/flags"
import type { PracticeAttempt } from "@/lib/coach/data"
import { loadExecutionMode } from "@/lib/resume/data"

export const metadata: Metadata = { title: "Interview questions" }
export const instant = false

const NOTE_LABELS = { structure: "Structure", relevance: "Relevance", specificity: "Specificity", improvement: "Try next" } as const

function Feedback({ attempt }: { attempt: PracticeAttempt }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Coaching notes · {new Date(attempt.createdAt).toLocaleString("en-US")}</span>
        <DroppedNote counts={attempt.dropped} />
      </div>
      <dl className="grid gap-2">
        {(Object.keys(NOTE_LABELS) as Array<keyof typeof NOTE_LABELS>).map((part) =>
          attempt.feedback[part] ? (
            <div key={part}>
              <dt className="text-xs font-medium text-muted-foreground">{NOTE_LABELS[part]}</dt>
              <dd>{attempt.feedback[part]}</dd>
            </div>
          ) : null,
        )}
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Length</dt>
          <dd>{attempt.feedback.length?.note}</dd>
        </div>
      </dl>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Your answer</summary>
        <p className="mt-1 whitespace-pre-wrap">{attempt.answer}</p>
      </details>
    </div>
  )
}

export default async function QuestionSetPage({ params }: { params: Promise<{ id: string }> }) {
  if (!careerCoachEnabled()) return <CoachOff />
  await connection()
  const { id } = await params
  const [set, mode] = await Promise.all([getQuestionSet(id), loadExecutionMode()])
  if (!set) notFound()
  const [analysis, attempts, labels] = await Promise.all([
    set.analysisId ? loadCoachAnalysis(set.analysisId) : Promise.resolve(null),
    listPracticeAnswers(set.id),
    loadFactLabels([...new Set(set.questions.flatMap((question) => question.factIds))]),
  ])
  const requirements = new Map((analysis?.requirements ?? []).map((requirement) => [requirement.id, requirement.text]))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={set.label}
        description={`${set.questions.length} questions`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {set.applicationId ? (
              <Button variant="outline" nativeButton={false} render={<Link href={`/applications/${set.applicationId}`} />}>Application</Button>
            ) : null}
            <Button variant="outline" nativeButton={false} render={<Link href="/interview/stories" />}>Story bank</Button>
            <DeleteMenu kind="set" id={set.id} redirectTo={set.applicationId ? `/applications/${set.applicationId}` : "/preparation"} />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <MetaLine provider={set.provider} model={set.model} mode={set.mode} />
        <DroppedNote counts={set.dropped} />
      </div>
      {set.questions.length === 0 ? <p className="text-sm text-muted-foreground">No question passed the checks. Generate again from the analysis.</p> : null}
      <ol className="grid gap-4">
        {set.questions.map((question) => {
          const latest = attempts.find((attempt) => attempt.questionId === question.id)
          return (
            <li key={question.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-2xl font-medium">{question.text}</p>
                <AddToPrep setId={set.id} questionId={question.id} added={Boolean(question.preparationItemId)} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Badge>{question.kind === "technical" ? "Technical" : "Behavioral"}</Badge>
                {question.requirementIds.map((requirementId) => (
                  <span key={requirementId} className="rounded-full border px-2 py-0.5 text-muted-foreground">
                    {requirements.get(requirementId) ?? requirementId}
                  </span>
                ))}
                {question.factIds.map((factId) => (
                  <span key={factId} className="rounded-full border px-2 py-0.5">{labels[factId] ?? "Verified fact"}</span>
                ))}
                {question.rationale ? <HelpTip label="What this checks">{question.rationale}</HelpTip> : null}
              </div>
              {latest ? <Feedback attempt={latest} /> : null}
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">{latest ? "Practice again" : "Practice"}</summary>
                <div className="mt-3">
                  <PracticeForm setId={set.id} questionId={question.id} mode={mode.mode} nonce={crypto.randomUUID()} />
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
