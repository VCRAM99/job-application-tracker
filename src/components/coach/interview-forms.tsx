"use client"

import { useActionState } from "react"

import { Run, type Mode } from "@/components/coach/controls"
import { FormStatus } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addQuestionToPrep, buildStoryBank, generateQuestionSet, practiceAnswer } from "@/lib/coach/actions"
import { initialRecordFormState } from "@/lib/records/form-state"

export function GenerateQuestionsForm({ analysisId, mode, nonce }: { analysisId: string; mode: Mode; nonce: string }) {
  const [state, action, pending] = useActionState(generateQuestionSet, initialRecordFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="analysisId" value={analysisId} />
      <input type="hidden" name="nonce" value={nonce} />
      <Run
        label="Generate questions"
        pendingLabel="Generating…"
        pending={pending}
        mode={mode}
        help="AI writes likely questions from this analysis. Questions tagged to unknown requirements, or that add claims not in your verified facts, are dropped and counted."
      />
      <FormStatus state={state} />
    </form>
  )
}

export function AddToPrep({ setId, questionId, added }: { setId: string; questionId: string; added: boolean }) {
  const [state, action, pending] = useActionState(addQuestionToPrep, initialRecordFormState)
  const done = added || (state.status === "idle" && Boolean(state.message))
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="setId" value={setId} />
      <input type="hidden" name="questionId" value={questionId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || done}>
        {done ? "In prep" : pending ? "Adding…" : "Add to prep"}
      </Button>
      {state.status === "error" ? <span role="alert" className="text-xs text-destructive">{state.message}</span> : null}
    </form>
  )
}

export function BuildStoriesForm({ mode, nonce, rebuild }: { mode: Mode; nonce: string; rebuild: boolean }) {
  const [state, action, pending] = useActionState(buildStoryBank, initialRecordFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="nonce" value={nonce} />
      <Run
        label={rebuild ? "Rebuild story bank" : "Build story bank"}
        pendingLabel="Building…"
        pending={pending}
        mode={mode}
        help="Maps your verified employment, project, and accomplishment facts to six competencies as STAR outlines. Outlines that add anything not in the cited facts are dropped."
      />
      <FormStatus state={state} />
    </form>
  )
}

export function PracticeForm({ setId, questionId, mode, nonce }: { setId: string; questionId: string; mode: Mode; nonce: string }) {
  const [state, action, pending] = useActionState(practiceAnswer, initialRecordFormState)
  const id = `answer-${questionId}`
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="setId" value={setId} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="nonce" value={nonce} />
      <Label htmlFor={id} className="sr-only">Your answer</Label>
      <Textarea id={id} name="answer" rows={6} maxLength={6000} required placeholder="Type your answer" />
      <Run
        label="Get coaching notes"
        pendingLabel="Reviewing…"
        pending={pending}
        mode={mode}
        help="Notes on structure, relevance, specificity, and one improvement. Length is counted in code. There is no score."
      />
      <FormStatus state={state} />
    </form>
  )
}
