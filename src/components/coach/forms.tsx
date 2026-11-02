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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addQuestionToPrep, buildStoryBank, deleteQuestionSet, generateQuestionSet, practiceAnswer } from "@/lib/coach/actions"
import { createDraft, createResearchBrief, deleteBrief, deleteDraft, markDraftSent, regenerateDraft, setDraftArchived } from "@/lib/coach/draft-actions"
import { createSuggestionTask, dismissSuggestion } from "@/lib/coach/follow-up-actions"
import { initialRecordFormState, type RecordFormState } from "@/lib/records/form-state"

type Mode = "managed" | "byok"

/** Billing mode stays visible next to every AI action. */
export function ModePicker({ mode }: { mode: Mode }) {
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

function Run({ label, pending, pendingLabel, mode, help }: { label: string; pending: boolean; pendingLabel: string; mode: Mode; help: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      <ModePicker mode={mode} />
      <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip>
    </div>
  )
}

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

export function ResearchForm({ applicationId, mode, nonce }: { applicationId: string; mode: Mode; nonce: string }) {
  const [state, action, pending] = useActionState(createResearchBrief, initialRecordFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="nonce" value={nonce} />
      <div className="flex items-center gap-2">
        <Label htmlFor="pasted">Paste company text</Label>
        <HelpTip label="About sources">
          Paste from the company&apos;s site, a press page, or your notes. The brief also uses this job&apos;s description and your company notes. Nothing is fetched from the web.
        </HelpTip>
      </div>
      <Textarea id="pasted" name="pasted" rows={8} maxLength={20000} />
      <Run
        label="Build brief"
        pendingLabel="Building…"
        pending={pending}
        mode={mode}
        help="Each claim must quote one of your sources word for word. Claims that do not are dropped and counted."
      />
      <FormStatus state={state} />
    </form>
  )
}

const FORMAT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  outreach: [
    { value: "connection_note", label: "Connection note (300)" },
    { value: "message", label: "Message (1,200)" },
    { value: "email", label: "Email (2,500)" },
  ],
  message: [
    { value: "message", label: "Message (1,200)" },
    { value: "email", label: "Email (2,500)" },
  ],
}

const KINDS: Array<{ value: string; label: string; formats: keyof typeof FORMAT_OPTIONS }> = [
  { value: "outreach_recruiter", label: "Recruiter outreach", formats: "outreach" },
  { value: "outreach_hiring_manager", label: "Hiring manager outreach", formats: "outreach" },
  { value: "referral_request", label: "Referral request", formats: "message" },
  { value: "follow_up", label: "Follow-up", formats: "message" },
  { value: "thank_you", label: "Thank-you", formats: "message" },
]

export function DraftForm({
  contactId,
  applicationId,
  initialKind,
  mode,
  nonce,
  applications,
  hasEmail,
}: {
  contactId: string | null
  applicationId: string | null
  initialKind: string
  mode: Mode
  nonce: string
  applications: Array<{ id: string; label: string }>
  hasEmail: boolean
}) {
  const [state, action, pending] = useActionState(createDraft, initialRecordFormState)
  const [kind, setKind] = useState(KINDS.some((item) => item.value === initialKind) ? initialKind : "outreach_recruiter")
  const formats = FORMAT_OPTIONS[KINDS.find((item) => item.value === kind)?.formats ?? "message"]!
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="nonce" value={nonce} />
      {contactId ? <input type="hidden" name="contactId" value={contactId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kind">Draft</Label>
          <NativeSelect id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="format">Format</Label>
          <NativeSelect id="format" name="format" key={kind} defaultValue={hasEmail ? "email" : formats[0]!.value}>
            {formats.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </NativeSelect>
        </div>
        {!contactId || applications.length > 0 ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="applicationId">Application</Label>
            <NativeSelect id="applicationId" name="applicationId" defaultValue={applicationId ?? ""}>
              <option value="">{contactId ? "Contact's application" : "None"}</option>
              {applications.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="angle">Angle (optional)</Label>
            <HelpTip label="About the angle">A short note on what to emphasize. It cannot add facts: only your verified facts count as evidence.</HelpTip>
          </div>
          <Textarea id="angle" name="angle" rows={2} maxLength={500} />
        </div>
      </div>
      <Run
        label="Draft"
        pendingLabel="Drafting…"
        pending={pending}
        mode={mode}
        help="AI drafts, the app checks every sentence against your verified facts, and you send it yourself. Nothing is sent from here."
      />
      <FormStatus state={state} />
    </form>
  )
}

export function AnswerForm({ applicationId, mode, nonce }: { applicationId: string; mode: Mode; nonce: string }) {
  const [state, action, pending] = useActionState(createDraft, initialRecordFormState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value="application_answer" />
      <input type="hidden" name="format" value="answer" />
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="nonce" value={nonce} />
      <Label htmlFor="question" className="sr-only">Application question</Label>
      <Textarea id="question" name="question" rows={3} maxLength={2000} required placeholder="Paste an application question" />
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="maxChars" className="text-xs text-muted-foreground">Limit</Label>
        <NativeSelect id="maxChars" name="maxChars" defaultValue="2500" className="w-32">
          <option value="500">500</option>
          <option value="1000">1,000</option>
          <option value="1500">1,500</option>
          <option value="2500">2,500</option>
        </NativeSelect>
      </div>
      <Run
        label="Draft answer"
        pendingLabel="Drafting…"
        pending={pending}
        mode={mode}
        help="Saved on this application so you can reuse it. Sentences that claim anything not in your verified facts are dropped."
      />
      <FormStatus state={state} />
    </form>
  )
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  )
}

export function DraftActions({
  draftId,
  status,
  copyText,
  mailto,
  mode,
  nonce,
  contactName,
}: {
  draftId: string
  status: "draft" | "marked_sent" | "archived"
  copyText: string
  mailto: string | null
  mode: Mode
  nonce: string
  contactName: string | null
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<"sent" | "delete" | null>(null)
  const [message, setMessage] = useState<RecordFormState>(initialRecordFormState)
  const [pending, start] = useTransition()
  const [regenState, regenerate, regenerating] = useActionState(regenerateDraft, initialRecordFormState)

  const call = (run: (form: FormData) => Promise<RecordFormState>, extra: Record<string, string> = {}) =>
    start(async () => {
      const form = new FormData()
      form.set("draftId", draftId)
      for (const [key, value] of Object.entries(extra)) form.set(key, value)
      const result = await run(form)
      setMessage(result)
      setConfirming(null)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={copyText} />
        {mailto ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<a href={mailto} />}>
            Open in email
          </Button>
        ) : null}
        {status === "draft" ? (
          <Button size="sm" onClick={() => setConfirming("sent")} disabled={pending}>
            Mark as sent
          </Button>
        ) : null}
        {status === "draft" ? (
          <form action={regenerate}>
            <input type="hidden" name="draftId" value={draftId} />
            <input type="hidden" name="nonce" value={nonce} />
            <input type="hidden" name="executionMode" value={mode} />
            <Button type="submit" size="sm" variant="outline" disabled={regenerating}>
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          </form>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label="More actions" />}>⋯</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {status === "draft" ? (
              <DropdownMenuItem onClick={() => call((form) => setDraftArchived(initialRecordFormState, form), { archive: "true" })}>Archive</DropdownMenuItem>
            ) : null}
            {status === "archived" ? (
              <DropdownMenuItem onClick={() => call((form) => setDraftArchived(initialRecordFormState, form), { archive: "false" })}>Restore</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming("delete")}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <FormStatus state={regenState.message ? regenState : message} />
      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming === "sent" ? "Mark as sent?" : "Delete this draft?"}</DialogTitle>
            <DialogDescription>
              {confirming === "sent"
                ? `Only do this after you sent it yourself.${contactName ? ` ${contactName}'s outreach status and last contacted date will update.` : ""}`
                : "The draft is removed. Linked contacts and applications stay."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            {confirming === "sent" ? (
              <Button disabled={pending} onClick={() => call((form) => markDraftSent(initialRecordFormState, form), { confirm: "sent" })}>
                {pending ? "Saving…" : "Mark as sent"}
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const form = new FormData()
                    form.set("draftId", draftId)
                    const result = await deleteDraft(form)
                    if (result.status === "error") {
                      setMessage(result)
                      setConfirming(null)
                      return
                    }
                    router.push("/networking")
                  })
                }
              >
                {pending ? "Deleting…" : "Delete"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function CopyText({ text }: { text: string }) {
  return <CopyButton text={text} />
}

export function DeleteMenu({ kind, id, redirectTo }: { kind: "set" | "brief"; id: string; redirectTo: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<RecordFormState>(initialRecordFormState)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" aria-label="More actions" />}>⋯</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormStatus state={message} />
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this {kind === "set" ? "question set" : "brief"}?</DialogTitle>
            <DialogDescription>
              {kind === "set" ? "Its practice answers are removed too. Preparation items stay." : "Drafts that used it keep their text."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const form = new FormData()
                  form.set(kind === "set" ? "setId" : "briefId", id)
                  const result = kind === "set" ? await deleteQuestionSet(form) : await deleteBrief(form)
                  if (result.status === "error") {
                    setMessage(result)
                    setConfirming(false)
                    return
                  }
                  router.push(redirectTo)
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

export function FollowUpActions({ suggestionKey, draftHref }: { suggestionKey: string; draftHref: string | null }) {
  const router = useRouter()
  const [state, setState] = useState<RecordFormState>(initialRecordFormState)
  const [pending, start] = useTransition()
  const run = (action: typeof createSuggestionTask) =>
    start(async () => {
      const form = new FormData()
      form.set("key", suggestionKey)
      setState(await action(initialRecordFormState, form))
      router.refresh()
    })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(createSuggestionTask)}>
        Create task
      </Button>
      {draftHref ? (
        <Button size="sm" variant="outline" nativeButton={false} render={<a href={draftHref} />}>
          Draft message
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(dismissSuggestion)} aria-label="Dismiss suggestion">
        Dismiss
      </Button>
      {state.message ? <span role="status" className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{state.message}</span> : null}
    </div>
  )
}
