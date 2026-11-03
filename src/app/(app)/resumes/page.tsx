import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { ResumeStudioOff } from "@/components/resume/off"
import { PageHeader, SectionHeader, RecordState } from "@/components/records/fields"
import { ResumeUpload } from "@/components/resume/upload"
import { Button } from "@/components/ui/button"
import { DeleteRecordButton } from "@/components/records/delete-record-button"
import { requireUser } from "@/lib/auth/session"
import { isUuid } from "@/lib/records/form-state"
import { cleanupAbandonedUploads, listResumes, listUnlinkedVersions } from "@/lib/resume/data"
import { deleteVersion } from "@/lib/resume/tailor-actions"
import { analyzeAllowed, resumesAllowed } from "@/lib/beta"

export const metadata: Metadata = { title: "Resumes" }
export const instant = false

const STATUS: Record<string, string> = { unparsed: "Not parsed", parsed: "Parsed", failed: "Parse failed" }

/** The delete dialog posts here; deleteVersion checks the flag, the owner, and the id. */
async function removeUnlinkedVersion(formData: FormData) {
  "use server"
  await deleteVersion(formData)
}

export default async function ResumesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await resumesAllowed())) return <ResumeStudioOff />
  await connection()
  // Abandoned uploads (older than a day, never registered) are removed with the user's own session.
  const [user, resumes, unlinked, query] = await Promise.all([requireUser(), listResumes(), listUnlinkedVersions(), searchParams, cleanupAbandonedUploads()])
  if (!resumes) {
    return <RecordState tone="error" title="Resumes could not be loaded" description="Apply the resume studio migration, then reload." />
  }
  const analysis = typeof query.analysis === "string" && isUuid(query.analysis) ? query.analysis : null
  const application = typeof query.application === "string" && isUuid(query.application) ? query.application : null
  const tailorQuery = analysis && (await analyzeAllowed()) ? `?analysis=${analysis}${application ? `&application=${application}` : ""}` : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Resumes"
        subtitle={tailorQuery ? "Choose a parsed resume to tailor." : undefined}
        help="Upload a resume, parse it, and tailor it to a fit analysis."
        action={<ResumeUpload userId={user.id} />}
      />
      {resumes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No resumes yet.</p>
      ) : (
        <ul className="grid gap-2">
          {resumes.map((resume) => (
            <li key={resume.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/resumes/${resume.id}`} className="min-w-0 truncate font-medium underline-offset-4 hover:underline">
                {resume.label}
              </Link>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span className="uppercase">{resume.kind}</span>
                <span>{STATUS[resume.parseStatus]}</span>
                {tailorQuery && resume.parseStatus === "parsed" ? (
                  <Button size="sm" nativeButton={false} render={<Link href={`/resumes/${resume.id}/tailor${tailorQuery}`} />}>
                    Tailor
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {unlinked.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="unlinked-versions-heading">
          <SectionHeader
            id="unlinked-versions-heading"
            title="Unlinked versions"
            help="Tailored versions whose resume was deleted and that are not linked to an application. Delete the ones you no longer need."
          />
          <ul className="grid gap-2">
            {unlinked.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{version.label}</span>
                <DeleteRecordButton
                  action={removeUnlinkedVersion}
                  id={version.id}
                  fields={{ versionId: version.id }}
                  label="Delete version"
                  title={`Delete ${version.label}?`}
                  description="This removes the tailored version. Nothing else changes."
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
