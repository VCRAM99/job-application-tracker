import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { DraftActions } from "@/components/coach/draft-forms"
import { CoachOff, DraftStatus, DroppedNote, MetaLine } from "@/components/coach/view"
import { PageHeader } from "@/components/records/fields"
import { HelpTip } from "@/components/ui/help-tip"
import { FORMAT_LIMITS } from "@/lib/ai/verify"
import { loadFactLabels } from "@/lib/analyze/data"
import { DRAFT_KIND_LABELS } from "@/lib/coach/constants"
import { getDraft } from "@/lib/coach/data"
import { FORMAT_LABELS } from "@/lib/coach/drafts"
import { careerCoachEnabled } from "@/lib/coach/flags"
import { buildMailto } from "@/lib/coach/mailto"
import { getContact } from "@/lib/records/tracker-data"
import { loadExecutionMode } from "@/lib/resume/data"

export const metadata: Metadata = { title: "Draft" }
export const instant = false

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  if (!careerCoachEnabled()) return <CoachOff />
  await connection()
  const { id } = await params
  const [draft, mode] = await Promise.all([getDraft(id), loadExecutionMode()])
  if (!draft) notFound()
  const [contact, labels] = await Promise.all([
    draft.contactId ? getContact(draft.contactId) : Promise.resolve(null),
    loadFactLabels(draft.factIds),
  ])
  const person = contact && contact.ok ? contact.data : null
  const mailto = draft.format === "email" || draft.format === "message" ? buildMailto(person?.email, draft.subject, draft.body) : null
  const copyText = draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body
  const back = person ? `/networking/${person.id}` : draft.applicationId ? `/applications/${draft.applicationId}` : "/networking"

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={DRAFT_KIND_LABELS[draft.kind]}
        subtitle={[person?.name, FORMAT_LABELS[draft.format]].filter(Boolean).join(" · ")}
        action={<Link href={back} className="text-sm underline-offset-4 hover:underline">Back</Link>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <DraftStatus status={draft.status} />
        <MetaLine provider={draft.provider} model={draft.model} mode={draft.mode} />
        <DroppedNote counts={draft.validation.dropped} label="sentences dropped" />
      </div>
      {draft.promptText ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Question:</span> {draft.promptText}
        </p>
      ) : null}
      <article className="flex flex-col gap-3 rounded-lg border p-4 text-sm leading-6">
        {draft.subject ? <p className="font-medium">{draft.subject}</p> : null}
        <p className="whitespace-pre-wrap">{draft.body}</p>
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {draft.body.length.toLocaleString("en-US")} / {FORMAT_LIMITS[draft.format].toLocaleString("en-US")}
        </p>
      </article>
      {draft.factIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Evidence">
          {draft.factIds.map((factId) => (
            <span key={factId} className="rounded-full border px-2 py-0.5">{labels[factId] ?? "Fact no longer verified"}</span>
          ))}
          <HelpTip label="About evidence">Sentences about you cite these verified facts. Anything else about you was dropped.</HelpTip>
        </div>
      ) : null}
      <DraftActions
        draftId={draft.id}
        status={draft.status}
        copyText={copyText}
        mailto={mailto}
        mode={mode.mode}
        nonce={crypto.randomUUID()}
        contactName={person?.name ?? null}
      />
      {draft.markedSentAt ? <p className="text-xs text-muted-foreground">Marked sent {new Date(draft.markedSentAt).toLocaleString("en-US")}</p> : null}
    </div>
  )
}
