"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState, useTransition } from "react"

import { FormStatus, NativeSelect } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { HelpTip } from "@/components/ui/help-tip"
import { initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"
import { deleteResume, parseResume, saveResumeAsCareerSource } from "@/lib/resume/actions"
import { decideEdit, linkVersion, tailorResume } from "@/lib/resume/tailor-actions"

type Mode = "managed" | "byok"

/** Billing mode stays visible next to every AI action. */
function ModePicker({ mode }: { mode: Mode }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-3 text-sm">
      <legend className="sr-only">Billing</legend>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="executionMode" value="byok" defaultChecked={mode !== "managed"} /> Your key
      </label>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="executionMode" value="managed" defaultChecked={mode === "managed"} /> Managed
      </label>
    </fieldset>
  )
}

export function ParseForm({ resumeId, mode, parsed }: { resumeId: string; mode: Mode; parsed: boolean }) {
  const [state, action, pending] = useActionState(parseResume, initialRecordFormState)
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="resumeId" value={resumeId} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant={parsed ? "outline" : "default"} disabled={pending}>
          {pending ? "Parsing…" : parsed ? "Parse again" : "Parse with AI"}
        </Button>
        <ModePicker mode={mode} />
        <HelpTip label="About parsing">
          AI splits the text into sections. Anything not found word for word in your file is dropped and counted. Nothing becomes a verified fact.
        </HelpTip>
      </div>
      <FormStatus state={state} />
    </form>
  )
}

export function ResumeMenu({ resumeId, label }: { resumeId: string; label: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<RecordFormState>(initialRecordFormState)
  const [pending, start] = useTransition()

  function saveSource() {
    start(async () => {
      const form = new FormData()
      form.set("resumeId", resumeId)
      setMessage(await saveResumeAsCareerSource(initialRecordFormState, form))
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="More actions" />}>⋯</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem disabled={pending} onClick={saveSource}>
            Save as career source
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            Delete resume
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormStatus state={message} />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {label}?</DialogTitle>
            <DialogDescription>The original file and its parse are removed. Tailored versions keep their content.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const form = new FormData()
                  form.set("resumeId", resumeId)
                  const result = await deleteResume(form)
                  if (result.status === "error") {
                    setMessage(result)
                    setConfirming(false)
                    return
                  }
                  router.push("/resumes")
                })
              }
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function TailorForm({
  resumeId,
  analysisId,
  applicationId,
  mode,
}: {
  resumeId: string
  analysisId: string
  applicationId: string | null
  mode: Mode
}) {
  const [state, action, pending] = useActionState(tailorResume, initialRecordFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="resumeId" value={resumeId} />
      <input type="hidden" name="analysisId" value={analysisId} />
      {applicationId ? <input type="hidden" name="applicationId" value={applicationId} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Tailoring…" : "Tailor resume"}
        </Button>
        <ModePicker mode={mode} />
        <HelpTip label="About tailoring">
          AI proposes edits; the app checks each one. Edits that add numbers, names, titles, dates, degrees, or skills not in your file or your verified facts are dropped.
        </HelpTip>
      </div>
      <FormStatus state={state} />
    </form>
  )
}

export function AnalysisPicker({ resumeId, analyses }: { resumeId: string; analyses: Array<{ id: string; label: string }> }) {
  const router = useRouter()
  if (analyses.length === 0) return <p className="text-sm text-muted-foreground">Run a fit analysis first.</p>
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const value = new FormData(event.currentTarget).get("analysis")
        if (value) router.push(`/resumes/${resumeId}/tailor?analysis=${encodeURIComponent(String(value))}`)
      }}
    >
      <NativeSelect name="analysis" aria-label="Analysis" className="max-w-xs">
        {analyses.map((analysis) => (
          <option key={analysis.id} value={analysis.id}>
            {analysis.label}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline">
        Tailor
      </Button>
    </form>
  )
}

export function EditDecision({ versionId, editId, status }: { versionId: string; editId: string; status: string }) {
  const [state, action, pending] = useActionState(decideEdit, initialRecordFormState)
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="editId" value={editId} />
      <Button type="submit" name="status" value="accepted" size="sm" variant={status === "accepted" ? "default" : "outline"} disabled={pending} aria-pressed={status === "accepted"}>
        Accept
      </Button>
      <Button type="submit" name="status" value="rejected" size="sm" variant={status === "rejected" ? "secondary" : "outline"} disabled={pending} aria-pressed={status === "rejected"}>
        Reject
      </Button>
      {state.status === "error" ? <span className="text-xs text-destructive">{state.message}</span> : null}
    </form>
  )
}

export function AcceptAll({ versionId, disabled }: { versionId: string; disabled: boolean }) {
  const [, action, pending] = useActionState(decideEdit, initialRecordFormState)
  return (
    <form action={action}>
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="editId" value="all" />
      <Button type="submit" name="status" value="accepted" variant="outline" size="sm" disabled={disabled || pending}>
        Accept all
      </Button>
    </form>
  )
}

export function LinkVersion({
  versionId,
  applicationId,
  applications,
}: {
  versionId: string
  applicationId: string | null
  applications: Array<{ id: string; label: string }>
}) {
  const [state, action, pending] = useActionState(linkVersion, initialRecordFormState)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <NativeSelect name="applicationId" defaultValue={applicationId ?? ""} aria-label="Application" className="max-w-xs">
        <option value="">Not linked</option>
        {applications.map((application) => (
          <option key={application.id} value={application.id}>
            {application.label}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Save link
      </Button>
      {state.message ? <span className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{state.message}</span> : null}
    </form>
  )
}
