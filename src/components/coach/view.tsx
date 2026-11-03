import Link from "next/link"

import { FollowUpActions } from "@/components/coach/draft-forms"
import { RecordState } from "@/components/records/fields"
import { HelpTip } from "@/components/ui/help-tip"
import { DRAFT_KIND_LABELS, type DraftKind } from "@/lib/coach/constants"
import type { DraftRecord } from "@/lib/coach/data"
import type { FollowUpSuggestion } from "@/lib/coach/follow-ups"
import type { CountMap } from "@/lib/coach/input"

export function CoachOff() {
  return (
    <RecordState
      title="Career coach is off"
      description="The interview and networking coach is not available for your account yet. Your applications and other tracking are unchanged."
    />
  )
}

export function CoachUnavailable() {
  return <RecordState tone="error" title="Career coach is not available yet" description="Apply the career coach migration, then reload." />
}

const REASON_LABELS: Record<string, string> = {
  new_number: "new number or date",
  new_name: "new name",
  new_title: "new title",
  new_credential: "new degree or certification",
  unverified_fact: "unverified fact cited",
  unknown_requirement: "unknown requirement",
  no_evidence: "no verified fact cited",
  ungrounded: "quote not in source",
  unknown_source: "unknown source",
  instruction_text: "quoted an instruction",
  score: "rating language",
  length: "length",
  duplicate: "duplicate",
  cap: "over the limit",
  sentence_cap: "over the sentence limit",
  rationale_dropped: "rationale removed",
}

function reasonLabel(reason: string) {
  if (reason.startsWith("subject_")) return `subject: ${REASON_LABELS[reason.slice(8)] ?? reason}`
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ")
}

/** "N dropped" with the reasons in a tooltip. Dropped items are never shown. */
export function DroppedNote({ counts, label = "dropped" }: { counts: CountMap; label?: string }) {
  const entries = Object.entries(counts).filter(([, value]) => value > 0)
  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  if (total === 0) return <span className="text-xs text-muted-foreground">0 {label}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {total} {label}
      <HelpTip label="Why items were dropped">
        {entries.map(([reason, value]) => `${value} ${reasonLabel(reason)}`).join(" · ")}. Dropped items failed a check and are not shown.
      </HelpTip>
    </span>
  )
}

export function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "done" }) {
  const toneClass = tone === "warn" ? "pill-overdue" : tone === "done" ? "pill-offer" : ""
  return <span className={`pill ${toneClass}`}>{children}</span>
}

export function DraftStatus({ status }: { status: DraftRecord["status"] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge>AI draft</Badge>
      {status === "marked_sent" ? <Badge tone="done">Marked sent</Badge> : status === "archived" ? <Badge>Archived</Badge> : <Badge tone="warn">Not sent</Badge>}
    </span>
  )
}

export function MetaLine({ provider, model, mode }: { provider: string; model: string; mode: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {provider} · {model} · {mode === "managed" ? "Managed" : "Your key"}
    </span>
  )
}

export function DraftList({ drafts, empty }: { drafts: DraftRecord[]; empty: string }) {
  if (drafts.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid gap-2">
      {drafts.map((draft) => (
        <li key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <Link href={`/drafts/${draft.id}`} className="min-w-0 truncate underline-offset-4 hover:underline">
            {draft.kind === "application_answer" && draft.promptText ? draft.promptText : DRAFT_KIND_LABELS[draft.kind as DraftKind]}
          </Link>
          <DraftStatus status={draft.status} />
        </li>
      ))}
    </ul>
  )
}

export function draftHref(suggestion: FollowUpSuggestion): string {
  const params = new URLSearchParams({ kind: suggestion.draftKind })
  if (suggestion.contactId) params.set("contact", suggestion.contactId)
  if (suggestion.applicationId) params.set("application", suggestion.applicationId)
  return `/drafts/new?${params.toString()}`
}

export function FollowUpList({ suggestions, empty = "No follow-ups due." }: { suggestions: FollowUpSuggestion[]; empty?: string }) {
  if (suggestions.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid gap-3">
      {suggestions.map((suggestion) => (
        <li key={suggestion.key} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={suggestion.contactId ? `/networking/${suggestion.contactId}` : `/applications/${suggestion.applicationId}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {suggestion.title}
            </Link>
            <span className={suggestion.overdue ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {suggestion.overdue ? "Overdue" : "Due"} {suggestion.dueDate}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{suggestion.detail}</p>
          <FollowUpActions suggestionKey={suggestion.key} draftHref={draftHref(suggestion)} />
        </li>
      ))}
    </ul>
  )
}

export function Section({ id, title, help, action, children }: { id: string; title: string; help?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id={`${id}-heading`} className="text-sm font-medium">{title}</h2>
          {help ? <HelpTip label={`About ${title.toLowerCase()}`}>{help}</HelpTip> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
