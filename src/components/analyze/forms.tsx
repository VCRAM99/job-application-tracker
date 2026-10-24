"use client"

import { useState } from "react"
import { useActionState } from "react"

import { claimRequirement, rerunAnalysis, startAnalysis } from "@/lib/analyze/actions"
import { normalizeJobText } from "@/lib/analyze/text"
import { FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { initialRecordFormState } from "@/lib/records/form-state"

export function AnalyzeForm({
  settings,
  sources,
  defaults,
  mockProvider,
  missingKey,
}: {
  settings: { executionMode: "managed" | "byok"; provider: string } | null
  sources: Array<{ id: string; label: string }>
  defaults: {
    title: string
    company: string
    jdText: string
    postingId: string
    applicationId: string
  }
  mockProvider: boolean
  missingKey: boolean
}) {
  const [state, formAction, pending] = useActionState(startAnalysis, initialRecordFormState)
  const [jdText, setJdText] = useState(defaults.jdText)
  const count = normalizeJobText(jdText).length
  if (!settings) {
    return (
      <p className="text-sm text-muted-foreground">
        Save a provider and an execution mode in Settings before running a qualification match.
      </p>
    )
  }
  return (
    <form action={formAction} className="grid gap-4">
      <FormStatus state={state} />
      {missingKey ? (
        <p className="text-sm text-destructive" role="alert">
          Save a key for the selected provider before running AI.
        </p>
      ) : null}
      {mockProvider ? (
        <p className="text-sm text-muted-foreground">
          A local mock provider is on. This run does not call OpenAI, Anthropic, or Gemini.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          Title
          <Input name="title" defaultValue={defaults.title} maxLength={200} />
        </label>
        <label className="grid gap-2 text-sm">
          Company
          <Input name="company" defaultValue={defaults.company} maxLength={200} />
        </label>
      </div>
      <label className="grid gap-2 text-sm">
        Job description
        <Textarea
          name="jdText"
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
          rows={12}
          required
        />
        <span className="text-muted-foreground">{count.toLocaleString("en-US")} characters after whitespace is normalized. Use 200 to 30,000.</span>
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Execution mode</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="executionMode" value="byok" defaultChecked={settings.executionMode !== "managed"} />
          Bring your own key
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="executionMode" value="managed" defaultChecked={settings.executionMode === "managed"} />
          Managed AI
        </label>
      </fieldset>
      <label className="grid gap-2 text-sm">
        Pasted resume for readability heuristics
        <NativeSelect name="resumeSourceId" defaultValue="">
          <option value="">Do not check a resume</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>{source.label}</option>
          ))}
        </NativeSelect>
      </label>
      {defaults.postingId ? <input type="hidden" name="postingId" value={defaults.postingId} /> : null}
      {defaults.applicationId ? <input type="hidden" name="applicationId" value={defaults.applicationId} /> : null}
      <Button type="submit" disabled={pending}>{pending ? "Analyzing…" : "Analyze fit"}</Button>
    </form>
  )
}

export function StoredPostingAnalysis({
  postingId,
  executionMode,
}: {
  postingId: string
  executionMode: "managed" | "byok"
}) {
  const [state, formAction, pending] = useActionState(startAnalysis, initialRecordFormState)
  return (
    <form action={formAction} className="grid gap-3">
      <FormStatus state={state} />
      <input type="hidden" name="postingId" value={postingId} />
      <input type="hidden" name="useStoredPosting" value="1" />
      <input type="hidden" name="executionMode" value={executionMode} />
      <Button type="submit" disabled={pending}>{pending ? "Analyzing…" : "Analyze fit"}</Button>
    </form>
  )
}

export function RerunButton({
  analysisId,
  executionMode,
}: {
  analysisId: string
  executionMode: "managed" | "byok"
}) {
  const [state, formAction, pending] = useActionState(rerunAnalysis, initialRecordFormState)
  const label = executionMode === "managed" ? "Managed AI" : "your own key"
  return (
    <form action={formAction} className="grid gap-2">
      <FormStatus state={state} />
      <input type="hidden" name="analysisId" value={analysisId} />
      <input type="hidden" name="executionMode" value={executionMode} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Checking…" : `Re-check with ${label}`}
      </Button>
    </form>
  )
}

export function ClaimButton({ analysisId, requirementId }: { analysisId: string; requirementId: string }) {
  const [state, formAction, pending] = useActionState(claimRequirement, initialRecordFormState)
  return (
    <form action={formAction} className="grid gap-2">
      <FormStatus state={state} />
      <input type="hidden" name="analysisId" value={analysisId} />
      <input type="hidden" name="requirementId" value={requirementId} />
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "I have this"}</Button>
    </form>
  )
}
