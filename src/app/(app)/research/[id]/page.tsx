import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { DeleteMenu } from "@/components/coach/forms"
import { CoachOff, DroppedNote, MetaLine } from "@/components/coach/view"
import { PageHeader } from "@/components/records/fields"
import { Button } from "@/components/ui/button"
import { HelpTip } from "@/components/ui/help-tip"
import { getBrief } from "@/lib/coach/data"
import { careerCoachEnabled } from "@/lib/coach/flags"
import { SOURCE_KIND_LABELS } from "@/lib/coach/research"

export const metadata: Metadata = { title: "Research brief" }
export const instant = false

export default async function ResearchBriefPage({ params }: { params: Promise<{ id: string }> }) {
  if (!careerCoachEnabled()) return <CoachOff />
  await connection()
  const { id } = await params
  const brief = await getBrief(id)
  if (!brief) notFound()
  const sources = new Map(brief.sources.map((source) => [source.id, source]))
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={brief.label}
        description="From your sources only. Each claim quotes one."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {brief.applicationId ? (
              <>
                <Button variant="outline" nativeButton={false} render={<Link href={`/drafts/new?application=${brief.applicationId}`} />}>Draft message</Button>
                <Button variant="outline" nativeButton={false} render={<Link href={`/applications/${brief.applicationId}`} />}>Application</Button>
              </>
            ) : null}
            <DeleteMenu kind="brief" id={brief.id} redirectTo={brief.applicationId ? `/applications/${brief.applicationId}` : "/applications"} />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <MetaLine provider={brief.provider} model={brief.model} mode={brief.mode} />
        <DroppedNote counts={brief.dropped} label="claims dropped" />
      </div>
      {brief.claims.length === 0 ? <p className="text-sm text-muted-foreground">No claim was grounded in your sources.</p> : null}
      <ul className="grid gap-3">
        {brief.claims.map((claim) => (
          <li key={claim.id} className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
            <p>{claim.text}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">[{claim.sourceId}]</span> “{claim.quote}”
            </p>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-2" aria-labelledby="sources-heading">
        <div className="flex items-center gap-2">
          <h2 id="sources-heading" className="text-sm font-medium">Sources</h2>
          <HelpTip label="About sources">Text you provided or stored. The SHA-256 identifies the exact text used.</HelpTip>
        </div>
        <ul className="grid gap-2">
          {[...sources.values()].map((source) => (
            <li key={source.id}>
              <details className="rounded-lg border px-3 py-2 text-sm">
                <summary className="cursor-pointer">
                  [{source.id}] {SOURCE_KIND_LABELS[source.kind] ?? source.label} · {source.text.length.toLocaleString("en-US")} chars
                </summary>
                <p className="mt-2 text-xs break-all text-muted-foreground">sha256 {source.sha256}</p>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{source.text}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
