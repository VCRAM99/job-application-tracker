import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { PageHeader } from "@/components/records/fields"
import { AcceptAll, LinkVersion, VersionMenu } from "@/components/resume/forms"
import { ResumeStudioOff } from "@/components/resume/off"
import { EditCard, ReadabilityCompare, ResumePreview } from "@/components/resume/view"
import { Button } from "@/components/ui/button"
import { HelpTip } from "@/components/ui/help-tip"
import { loadFactLabels } from "@/lib/analyze/data"
import { getVersion, listApplicationOptions } from "@/lib/resume/data"
import { DROP_REASONS } from "@/lib/resume/tailor"
import { resumesAllowed } from "@/lib/beta"

export const metadata: Metadata = { title: "Tailored resume" }
export const instant = false

const DROP_LABELS: Record<string, string> = {
  bad_target: "unknown target",
  before_mismatch: "text did not match",
  no_evidence: "no verified fact cited",
  new_number: "new number or date",
  new_name: "new name",
  new_credential: "new degree or certification",
  new_title: "new title",
  skill_not_verified: "skill not verified",
  skill_present: "skill already listed",
  length: "length",
  bad_order: "bad reorder",
  conflict: "duplicate target",
  edit_cap: "over the edit limit",
  no_change: "no change",
}

export default async function VersionPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  if (!(await resumesAllowed())) return <ResumeStudioOff />
  await connection()
  const { versionId } = await params
  const [version, applications] = await Promise.all([getVersion(versionId), listApplicationOptions()])
  if (!version) notFound()
  const factLabels = await loadFactLabels([...new Set(version.edits.flatMap((edit) => edit.factIds))])
  const dropped = DROP_REASONS.filter((reason) => (version.dropped[reason] ?? 0) > 0)
  const droppedTotal = dropped.reduce((sum, reason) => sum + (version.dropped[reason] ?? 0), 0)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader
        title={version.label}
        subtitle={`${version.provider} · ${version.model} · ${version.mode === "managed" ? "Managed" : "Your key"}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<a href={`/api/resumes/versions/${version.id}/export?format=docx`} />}>
              DOCX
            </Button>
            <Button variant="outline" nativeButton={false} render={<a href={`/api/resumes/versions/${version.id}/export?format=pdf`} />}>
              PDF
            </Button>
            <VersionMenu versionId={version.id} resumeId={version.resumeId} />
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3" aria-labelledby="edits-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 id="edits-heading" className="text-sm font-medium">Proposed edits</h2>
              <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">AI-proposed · unverified</span>
            </div>
            <AcceptAll versionId={version.id} disabled={version.pending === 0} />
          </div>
          {droppedTotal > 0 ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {droppedTotal} dropped by checks
              <HelpTip label="Why edits were dropped">
                {dropped.map((reason) => `${version.dropped[reason]} ${DROP_LABELS[reason]}`).join(", ")}.
              </HelpTip>
            </p>
          ) : null}
          {version.edits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No edits passed the checks. The resume is unchanged.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {version.edits.map((edit) => (
                <EditCard key={edit.id} edit={edit} versionId={version.id} base={version.base} factLabels={factLabels} />
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="preview-heading">
          <div className="flex items-center gap-2">
            <h2 id="preview-heading" className="text-sm font-medium">Preview</h2>
            <HelpTip label="About the preview">Accepted edits only. Downloads use exactly this content.</HelpTip>
          </div>
          <ResumePreview content={version.final} />
        </section>
      </div>
      <ReadabilityCompare before={version.readabilityBefore} after={version.readabilityAfter} />
      <section className="flex flex-col gap-2" aria-labelledby="link-heading">
        <h2 id="link-heading" className="text-sm font-medium">Application</h2>
        <LinkVersion versionId={version.id} applicationId={version.applicationId} applications={applications} />
        {version.applicationId ? (
          <Link href={`/applications/${version.applicationId}`} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Open application
          </Link>
        ) : null}
      </section>
    </div>
  )
}
